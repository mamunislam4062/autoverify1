const express = require('express');
const path = require('path');

// Global emitLog fallback - must be defined before any modules that use it
if (!global.emitLog) {
    global.emitLog = (message, type = 'info') => {
        console.log(`[LOG] ${message}`);
    };
}

// Import bot and its server logic
// Importing bot.js starts the bot logic
const botInstance = require('./bot.js'); 
const databaseModule = require('./database/server.js');
const { app } = databaseModule;
const db = require('./db.js');

// Railway injects PORT and proxies to whatever port we bind; fall back to 3000
// so local `npm run dev` and docker-compose keep working unchanged.
const PORT = parseInt(process.env.PORT, 10) || 3000;

async function startServer() {
  // Wait for database to be ready
  console.log('⏳ Waiting for database readiness...');
  try {
    const dbTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('DB_TIMEOUT')), 15000));
    await Promise.race([db.dbReady, dbTimeout]);
    console.log('✅ Database is ready.');
  } catch (e) {
    if (e.message === 'DB_TIMEOUT') {
        console.warn('⚠️ Database readiness timed out after 15s. Starting server anyway...');
    } else {
        console.error('⚠️ Database failed to initialize properly:', e);
    }
  }

  // The 'app' from database/server.js already has API routes defined and serves the 'web' directory.
  // We no longer use Vite middleware since this is a vanilla HTML/JS application, not a React SPA.

  // Initialize Database/API server logic (chmod, bot restoration, etc.)
  if (typeof databaseModule.startServer === 'function') {
      databaseModule.startServer().catch(e => console.error('Database Server init error:', e));
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Unified Bot & Web Server running on http://localhost:${PORT}`);
    console.log(`📍 User Panel: http://localhost:${PORT}/`);
    console.log(`📍 Admin Panel: http://localhost:${PORT}/admin`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Full-stack proxy might be sticking.`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
    }
  });
}

// Global Process Error Handlers to prevent crashes from unhandled errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Continue running
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
    // Optional: process.exit(1) if you want to force a restart, but usually better to stay up if possible
});

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
