# ---------------------------------------------------------------------------
# Live Stream Assistant worker
#
# The Node app cannot stream audio into a Telegram group call: GramJS has no
# voice-chat/RTP support and there is no Node equivalent of PyTgCalls. This
# worker is the real streaming engine, running the same proven stack the
# reference music bots use:
#
#     Pyrogram  -> userbot session that joins the chat
#     PyTgCalls -> joins the group call and pipes audio into it
#     yt-dlp    -> resolves a track URL to a direct bestaudio stream
#
# It exposes a small HTTP control API on 127.0.0.1 that the Node layer
# proxies to, so the admin panel never talks to it directly.
#
# Configuration (App API ID / API Hash / Session String) arrives at runtime
# through POST /configure, because the admin can change it from the panel.
# ---------------------------------------------------------------------------

import asyncio
import json
import logging
import os
import time
import traceback
from typing import Any, Dict, List, Optional

from aiohttp import web

LOG = logging.getLogger("livestream")

PORT = int(os.environ.get("LIVESTREAM_WORKER_PORT", "8099"))
HOST = os.environ.get("LIVESTREAM_WORKER_HOST", "127.0.0.1")

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

client = None            # pyrogram.Client
pytgcalls = None         # PyTgCalls
pyrogram_ready = False
pytgcalls_ready = False
last_error: str = ""

# chat_id -> list of track dicts currently queued (the head is playing)
queues: Dict[int, List[Dict[str, Any]]] = {}
# chat_id -> metadata about what is playing right now
now_playing: Dict[int, Dict[str, Any]] = {}
# chat_id -> asyncio task for a scheduled start
scheduled: Dict[int, asyncio.Task] = {}
# chat_id -> True when the stream is paused
paused: set = set()

# Set to True whenever a client is created, so the stream_end hook rebinds.
generation = 0


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def status_for(chat_id: Optional[int]) -> Dict[str, Any]:
    if chat_id is None:
        return {
            "workerUp": True,
            "pyrogramReady": pyrogram_ready,
            "pytgcallsReady": pytgcalls_ready,
            "lastError": last_error,
            "streaming": bool(now_playing),
            "chats": [
                status_for(c) for c in sorted(set(list(now_playing) + list(queues)))
            ],
        }

    q = queues.get(chat_id, [])
    current = now_playing.get(chat_id)
    task = scheduled.get(chat_id)
    return {
        "chatId": chat_id,
        "streaming": bool(current) and not task,
        "paused": chat_id in paused,
        "joined": bool(current) and not task,
        "current": current,
        "queue": [t.get("title", "Unknown") for t in q],
        "queueLength": len(q),
        "scheduled": bool(task),
        "scheduledInSeconds": max(0, int(task.get("fireAt") - time.time())) if task else 0,
        "scheduledTrack": task.get("track", {}).get("title") if task else None,
    }


def set_error(msg: str) -> None:
    global last_error
    last_error = msg
    LOG.error(msg)


# ---------------------------------------------------------------------------
# Audio resolution
# ---------------------------------------------------------------------------

async def resolve_audio(url: str) -> Optional[str]:
    """Turn a YouTube / direct audio URL into a streamable bestaudio URL."""
    if not url:
        return None
    if url.startswith("http") and ("youtube.com" not in url and "youtu.be" not in url):
        # Already a direct audio link.
        return url

    proc = await asyncio.create_subprocess_exec(
        "yt-dlp", "-g", "-f", "bestaudio", url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0 or not stdout:
        LOG.warning("yt-dlp failed for %s: %s", url, stderr.decode(errors="ignore")[:200])
        return None
    first = stdout.decode(errors="ignore").strip().splitlines()
    return first[0] if first else None


# ---------------------------------------------------------------------------
# Pyrogram / PyTgCalls lifecycle
# ---------------------------------------------------------------------------

def build_clients(api_id: int, api_hash: str, session_string: str):
    """Create a fresh Pyrogram client + PyTgCalls binding."""
    from pyrogram import Client
    from pyrogram.errors import SessionPasswordNeeded, SessionRevoked

    global client, pytgcalls, pyrogram_ready, pytgcalls_ready, generation

    # Tear the old client down first so we never leak sessions.
    if client is not None:
        try:
            asyncio.get_event_loop().create_task(client.stop())
        except Exception:
            pass
    client = None
    pytgcalls = None
    pyrogram_ready = False
    pytgcalls_ready = False
    generation += 1
    my_gen = generation

    c = Client(
        "livestream-assistant",
        api_id=api_id,
        api_hash=api_hash,
        session_string=session_string,
        in_memory=True,
    )
    return c, my_gen, (SessionPasswordNeeded, SessionRevoked)


async def start_client(api_id: int, api_hash: str, session_string: str) -> Dict[str, Any]:
    global client, pytgcalls, pyrogram_ready, pytgcalls_ready, last_error

    from pytgcalls import PyTgCalls
    from pytgcalls.types import Update
    from pytgcalls.types.input_stream import AudioPiped

    c, my_gen, _ = build_clients(api_id, api_hash, session_string)

    try:
        await c.start()
    except Exception as e:
        text = str(e)
        if "2FA" in text or "password" in text.lower():
            raise RuntimeError("This session needs 2FA. Disable 2FA for the helper account or re-login it.")
        raise RuntimeError(f"Pyrogram could not start: {text}")

    if my_gen != generation:
        # A newer configure() already replaced us.
        try:
            await c.stop()
        except Exception:
            pass
        return {"ok": False, "message": "superseded by a newer configuration"}

    calls = PyTgCalls(c)
    await calls.start()

    @calls.on_stream_end()
    async def on_stream_end(client_ref, update: Update):
        # Auto-advance to the next queued track.
        chat_id = update.chat_id
        if chat_id in paused:
            return
        q = queues.get(chat_id, [])
        if q:
            nxt = q.pop(0)
            await play_now(chat_id, nxt)
        else:
            now_playing.pop(chat_id, None)
            try:
                await calls.leave_group_call(chat_id)
            except Exception:
                pass

    client = c
    pytgcalls = calls
    pyrogram_ready = True
    pytgcalls_ready = True
    last_error = ""
    me = await c.get_me()
    LOG.info("Live Stream userbot connected as @%s", getattr(me, "username", "?"))
    return {"ok": True, "username": getattr(me, "username", None), "message": "connected"}


async def stop_client() -> None:
    global client, pytgcalls, pyrogram_ready, pytgcalls_ready
    for t in list(scheduled.values()):
        t.cancel()
    scheduled.clear()
    if client is not None:
        try:
            await client.stop()
        except Exception:
            pass
    client = None
    pytgcalls = None
    pyrogram_ready = False
    pytgcalls_ready = False


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

def ensure_ready() -> None:
    if not pyrogram_ready or not pytgcalls_ready:
        raise RuntimeError(
            "Live Stream Assistant is not connected. Save a valid App API ID, "
            "API Hash and Session String on the Groups & Moderation page first."
        )


async def join_chat(chat_id: int) -> Dict[str, Any]:
    """Make sure the userbot is a member of the target chat."""
    from pyrogram.errors import UserAlreadyParticipant, InviteHashExpired

    try:
        await client.join_chat(chat_id)
    except UserAlreadyParticipant:
        pass
    except InviteHashExpired:
        raise RuntimeError(
            "The helper account cannot join this chat. Add it to the group/channel "
            "manually first, then try again."
        )
    except Exception as e:
        text = str(e)
        if "FLOOD" in text.upper() or "wait" in text.lower():
            raise RuntimeError("Telegram flood wait: the helper account is joining too often. Try again later.")
        raise


async def play_now(chat_id: int, track: Dict[str, Any]) -> Dict[str, Any]:
    """Stream one track into the chat right now."""
    from pytgcalls.types.input_stream import AudioPiped

    ensure_ready()
    stream_url = await resolve_audio(track.get("url", ""))
    if not stream_url:
        raise RuntimeError("Could not resolve an audio stream for this track. Check the link.")

    audio = AudioPiped(stream_url)
    try:
        await pytgcalls.play(chat_id, audio)
    except Exception:
        # Some chats need an explicit join before the first play.
        await join_chat(chat_id)
        await pytgcalls.join_group_call(chat_id, audio)

    now_playing[chat_id] = {
        "title": track.get("title", "Unknown"),
        "artist": track.get("artist") or "",
        "url": track.get("url", ""),
        "duration": track.get("duration"),
        "thumb": track.get("thumb"),
        "requestedBy": track.get("requestedBy"),
        "startedAt": now_iso(),
    }
    paused.discard(chat_id)
    return now_playing[chat_id]


# ---------------------------------------------------------------------------
# HTTP API
# ---------------------------------------------------------------------------

async def json_body(request: web.Request) -> Dict[str, Any]:
    try:
        return await request.json()
    except Exception:
        return {}


def reply(data: Dict[str, Any], status: int = 200) -> web.Response:
    return web.json_response(data, status=status)


async def h_health(request: web.Request) -> web.Response:
    return reply({
        "ok": True,
        "pyrogramReady": pyrogram_ready,
        "pytgcallsReady": pytgcalls_ready,
        "lastError": last_error,
    })


async def h_configure(request: web.Request) -> web.Response:
    body = await json_body(request)
    api_id = str(body.get("apiId", "")).strip()
    api_hash = str(body.get("apiHash", "")).strip()
    session = str(body.get("sessionString", "")).strip()

    if not (api_id and api_hash and session):
        await stop_client()
        return reply({"ok": False, "message": "cleared - no credentials saved"})

    try:
        await stop_client()
        result = await start_client(int(api_id), api_hash, session)
        return reply(result)
    except Exception as e:
        set_error(str(e))
        return reply({"ok": False, "message": str(e)}, status=200)


async def h_join(request: web.Request) -> web.Response:
    body = await json_body(request)
    chat_id = body.get("chatId")
    if chat_id is None:
        return reply({"ok": False, "message": "chatId is required"}, status=400)
    try:
        chat_id = int(str(chat_id).lstrip("-").split("_")[0] or 0) or int(chat_id)
    except Exception:
        pass
    try:
        ensure_ready()
        await join_chat(int(chat_id))
        return reply({"ok": True, "message": "Helper account joined the chat."})
    except Exception as e:
        return reply({"ok": False, "message": str(e)})


async def h_play(request: web.Request) -> web.Response:
    body = await json_body(request)
    chat_id = body.get("chatId")
    if chat_id is None:
        return reply({"ok": False, "message": "chatId is required"}, status=400)
    chat_id = int(chat_id)
    track = {
        "url": body.get("url", ""),
        "title": body.get("title") or body.get("query") or "Live track",
        "artist": body.get("artist"),
        "duration": body.get("duration"),
        "thumb": body.get("thumb"),
        "requestedBy": body.get("requestedBy"),
    }
    if not track["url"]:
        return reply({"ok": False, "message": "A track URL is required."}, status=400)
    try:
        ensure_ready()
        # A scheduled start for this chat is superseded by a manual play.
        task = scheduled.pop(chat_id, None)
        if task:
            task.cancel()
        current = await play_now(chat_id, track)
        return reply({"ok": True, "message": f"Now playing: {current['title']}", "current": current})
    except Exception as e:
        return reply({"ok": False, "message": str(e)})


async def h_queue(request: web.Request) -> web.Response:
    body = await json_body(request)
    chat_id = int(body.get("chatId"))
    track = {
        "url": body.get("url", ""),
        "title": body.get("title") or "Queued track",
        "artist": body.get("artist"),
        "duration": body.get("duration"),
        "thumb": body.get("thumb"),
        "requestedBy": body.get("requestedBy"),
    }
    queues.setdefault(chat_id, []).append(track)
    return reply({"ok": True, "queue": status_for(chat_id)["queue"]})


async def h_pause(request: web.Request) -> web.Response:
    body = await json_body(request)
    chat_id = int(body.get("chatId"))
    try:
        ensure_ready()
        await pytgcalls.pause_stream(chat_id)
        paused.add(chat_id)
        return reply({"ok": True, "message": "Stream paused."})
    except Exception as e:
        return reply({"ok": False, "message": str(e)})


async def h_resume(request: web.Request) -> web.Response:
    body = await json_body(request)
    chat_id = int(body.get("chatId"))
    try:
        ensure_ready()
        await pytgcalls.resume_stream(chat_id)
        paused.discard(chat_id)
        return reply({"ok": True, "message": "Stream resumed."})
    except Exception as e:
        return reply({"ok": False, "message": str(e)})


async def h_stop(request: web.Request) -> web.Response:
    body = await json_body(request)
    chat_id = int(body.get("chatId"))
    task = scheduled.pop(chat_id, None)
    if task:
        task.cancel()
    queues.pop(chat_id, None)
    now_playing.pop(chat_id, None)
    paused.discard(chat_id)
    try:
        if pytgcalls_ready:
            await pytgcalls.leave_group_call(chat_id)
        return reply({"ok": True, "message": "Stream stopped and helper left the call."})
    except Exception as e:
        return reply({"ok": False, "message": str(e)})


async def h_schedule(request: web.Request) -> web.Response:
    """Start the stream automatically after <minutes> minutes."""
    body = await json_body(request)
    chat_id = int(body.get("chatId"))
    minutes = float(body.get("minutes", 0))
    if minutes <= 0:
        return reply({"ok": False, "message": "minutes must be greater than 0"}, status=400)
    if minutes > 24 * 60:
        return reply({"ok": False, "message": "Pick a time under 24 hours."}, status=400)

    track = {
        "url": body.get("url", ""),
        "title": body.get("title") or "Scheduled track",
        "artist": body.get("artist"),
        "duration": body.get("duration"),
        "thumb": body.get("thumb"),
        "requestedBy": body.get("requestedBy"),
    }
    if not track["url"]:
        return reply({"ok": False, "message": "Pick a track to schedule first."}, status=400)

    old = scheduled.pop(chat_id, None)
    if old:
        old.cancel()

    delay = minutes * 60
    state = {"fireAt": time.time() + delay, "track": track}

    async def fire() -> None:
        try:
            await asyncio.sleep(delay)
            LOG.info("Scheduled start firing for chat %s", chat_id)
            ensure_ready()
            await join_chat(chat_id)
            await play_now(chat_id, track)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            set_error(f"Scheduled start failed: {e}")
            LOG.error("Scheduled start failed: %s", e)
        finally:
            if scheduled.get(chat_id) is not None and scheduled[chat_id].get("fireAt") == state["fireAt"]:
                scheduled.pop(chat_id, None)

    task = asyncio.ensure_future(fire())
    state["task"] = task
    scheduled[chat_id] = state
    return reply({
        "ok": True,
        "message": f"Scheduled: the live stream will start automatically in {minutes:g} minute(s).",
        "status": status_for(chat_id),
    })


async def h_cancel_schedule(request: web.Request) -> web.Response:
    body = await json_body(request)
    chat_id = int(body.get("chatId"))
    task = scheduled.pop(chat_id, None)
    if task:
        task["task"].cancel()
    return reply({"ok": True, "message": "Scheduled start cancelled."})


async def h_status(request: web.Request) -> web.Response:
    body = await json_body(request)
    chat_id = body.get("chatId")
    if chat_id in (None, "", "null"):
        return reply(status_for(None))
    try:
        return reply(status_for(int(chat_id)))
    except Exception:
        return reply(status_for(None))


async def h_search(request: web.Request) -> web.Response:
    body = await json_body(request)
    query = str(body.get("query", "")).strip()
    if not query:
        return reply({"ok": True, "results": []})
    try:
        from youtube_search import VideosSearch
        vs = VideosSearch(query, max_results=8)
        results = []
        for item in (vs.get_result() or {}).get("result", []):
            results.append({
                "title": item.get("title"),
                "url": item.get("link"),
                "channel": item.get("channel", {}).get("name") if isinstance(item.get("channel"), dict) else None,
                "thumb": item.get("thumbnails", [{}])[0].get("url") if item.get("thumbnails") else None,
                "views": item.get("viewCount", {}).get("short") if isinstance(item.get("viewCount"), dict) else None,
                "duration": item.get("duration"),
            })
        return reply({"ok": True, "results": results})
    except Exception as e:
        return reply({"ok": False, "message": f"Search failed: {e}", "results": []})


def build_app() -> web.Application:
    app = web.Application(client_max_size=4 * 1024 * 1024)
    app.add_routes([
        web.get("/health", h_health),
        # the Node bridge posts to /health, so accept both verbs there
        web.post("/health", h_health),
        web.post("/configure", h_configure),
        web.post("/join", h_join),
        web.post("/play", h_play),
        web.post("/queue", h_queue),
        web.post("/pause", h_pause),
        web.post("/resume", h_resume),
        web.post("/stop", h_stop),
        web.post("/schedule", h_schedule),
        web.post("/cancel-schedule", h_cancel_schedule),
        web.post("/status", h_status),
        web.post("/search", h_search),
    ])

    # aiohttp dropped Application.on_error in 3.9, so use middleware instead.
    @web.middleware
    async def error_middleware(request, handler):
        try:
            return await handler(request)
        except web.HTTPException:
            raise
        except Exception as exc:
            LOG.error("worker error on %s: %s", request.path, exc)
            LOG.debug(traceback.format_exc())
            return reply({"ok": False, "message": str(exc)})

    app.middlewares.append(error_middleware)
    return app


async def main() -> None:
    logging.basicConfig(
        level=os.environ.get("LIVESTREAM_WORKER_LOG", "INFO"),
        format="%(asctime)s [livestream] %(levelname)s %(message)s",
    )
    LOG.info("Live Stream worker starting on %s:%s", HOST, PORT)
    runner = web.AppRunner(build_app())
    await runner.setup()
    site = web.TCPSite(runner, HOST, PORT)
    await site.start()
    LOG.info("Live Stream worker ready")

    # Keep the process alive.
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
