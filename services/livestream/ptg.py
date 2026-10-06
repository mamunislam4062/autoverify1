"""PyTgCalls version compatibility layer.

PyTgCalls 3.0 renamed and removed most of the 2.x surface that music bots are
written against:

    2.x                               3.x
    --------------------------------  ---------------------------------
    types.input_stream.AudioPiped     types.MediaStream
    join_group_call(chat, stream)     play(chat, stream) joins by itself
    leave_group_call(chat)           leave_call(chat)
    pause_stream(chat)                pause(chat)
    resume_stream(chat)               resume(chat)
    @on_stream_end()                  @on_update() + isinstance check

The worker only ever talks to PyTgCalls through this module, so it keeps
working whichever major version pip resolves. Everything is resolved once at
import time and the neutral helpers below hide the difference.
"""

from typing import Any, Awaitable, Callable, Optional

_API = None          # 2 or 3
_VERSION = "unknown"
_StreamEnded = None  # 3.x Update subclass, None on 2.x


def _detect() -> None:
    """Work out which PyTgCalls major version is installed."""
    global _API, _VERSION, _StreamEnded

    import pytgcalls
    _VERSION = getattr(pytgcalls, "__version__", "unknown")

    # 3.x exposes MediaStream; 2.x only has the input_stream classes.
    try:
        from pytgcalls.types import MediaStream  # noqa: F401
        _API = 3
    except ImportError:
        _API = 2

    if _API == 3:
        from pytgcalls.types import StreamEnded
        _StreamEnded = StreamEnded


def load() -> None:
    """Import pytgcalls and detect its API. Safe to call more than once."""
    if _API is None:
        _detect()


def api_version() -> int:
    """2 or 3, depending on what is installed."""
    load()
    return _API


def library_version() -> str:
    load()
    return _VERSION


def describe() -> str:
    return f"PyTgCalls {_VERSION} (API v{api_version()})"


# ---------------------------------------------------------------------------
# Stream objects
# ---------------------------------------------------------------------------

def make_stream(url: str) -> Any:
    """Build an audio-only stream object for a resolved audio URL.

    `url` must already be a direct stream URL, which is what resolve_audio()
    produces.
    """
    load()

    if _API == 3:
        from pytgcalls.types import MediaStream

        try:
            # An already-resolved audio URL with video explicitly ignored:
            # this is a music stream, not a video call.
            return MediaStream(url, video_flags=MediaStream.Flags.IGNORE)
        except Exception:
            # Some builds dislike the flag; hand it over as a pure audio
            # source instead.
            return MediaStream(audio_path=url)
    else:
        from pytgcalls.types.input_stream import AudioPiped
        return AudioPiped(url)


# ---------------------------------------------------------------------------
# Call control
# ---------------------------------------------------------------------------

async def play(calls: Any, chat_id: int, stream: Any) -> None:
    """Join the chat if needed and start streaming."""
    load()

    if _API == 3:
        await calls.play(chat_id, stream)
        return

    # 2.x: join first, then hand the same stream over. play() alone does not
    # always join, which is why the reference bots call join_group_call().
    await calls.join_group_call(chat_id, stream)


async def leave(calls: Any, chat_id: int) -> None:
    load()
    if _API == 3:
        await calls.leave_call(chat_id)
    else:
        await calls.leave_group_call(chat_id)


async def pause(calls: Any, chat_id: int) -> None:
    load()
    if _API == 3:
        await calls.pause(chat_id)
    else:
        await calls.pause_stream(chat_id)


async def resume(calls: Any, chat_id: int) -> None:
    load()
    if _API == 3:
        await calls.resume(chat_id)
    else:
        await calls.resume_stream(chat_id)


# ---------------------------------------------------------------------------
# Stream-ended callback
# ---------------------------------------------------------------------------

def on_stream_end(
    calls: Any,
    handler: Callable[[int], Awaitable[None]],
) -> None:
    """Register `handler(chat_id)` to run when a stream finishes.

    2.x has a dedicated on_stream_end decorator. 3.x replaced it with a
    single on_update hook, so the handler is registered broadly and filtered
    by isinstance here instead.
    """
    load()

    if _API == 3:
        from pytgcalls.types import StreamEnded

        @calls.on_update()
        async def _dispatch(update: Any) -> None:
            if isinstance(update, StreamEnded):
                await handler(update.chat_id)

        return

    @calls.on_stream_end()
    async def _dispatch(update: Any) -> None:
        await handler(update.chat_id)


def probe_sync() -> dict:
    """Describe the installed stack without touching the event loop."""
    info: dict = {"pytgcalls": library_version(), "api": api_version()}
    try:
        import pyrogram
        info["pyrogram"] = getattr(pyrogram, "__version__", "unknown")
    except ImportError:
        info["pyrogram"] = None
    return info


async def probe() -> dict:
    """Async convenience wrapper around probe_sync()."""
    return probe_sync()