/**
 * TASKS API ENDPOINTS
 * Add these to server.js to fix the tasks loading error
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

// Default tasks to seed if none exist
const DEFAULT_TASKS = [
    {
        id: 'task_1',
        name: 'Join Telegram Channel',
        icon: 'https://cdn-icons-png.flaticon.com/512/2111/2111646.png',
        url: 'https://t.me/your_channel',
        reward: 50,
        gems: 5,
        type: 'telegram',
        completed: false
    },
    {
        id: 'task_2',
        name: 'Subscribe YouTube',
        icon: 'https://cdn-icons-png.flaticon.com/512/1384/1384060.png',
        url: 'https://youtube.com/@yourchannel',
        reward: 100,
        gems: 10,
        type: 'youtube',
        completed: false
    },
    {
        id: 'task_3',
        name: 'Follow on Twitter',
        icon: 'https://cdn-icons-png.flaticon.com/512/733/733579.png',
        url: 'https://twitter.com/your_handle',
        reward: 75,
        gems: 7,
        type: 'twitter',
        completed: false
    },
    {
        id: 'task_4',
        name: 'Invite 3 Friends',
        icon: 'https://cdn-icons-png.flaticon.com/512/2956/2956820.png',
        url: '',
        reward: 200,
        gems: 20,
        type: 'invite',
        completed: false
    },
    {
        id: 'task_5',
        name: 'Daily Check-in',
        icon: 'https://cdn-icons-png.flaticon.com/512/2693/2693507.png',
        url: '',
        reward: 25,
        gems: 2,
        type: 'daily',
        completed: false
    }
];

// GET /api/admin/tasks - Get all tasks (public endpoint for users)
router.get('/api/admin/tasks', (req, res) => {
    try {
        // Ensure tasks object exists
        if (!db.data) db.data = {};
        if (!db.data.tasks) db.data.tasks = {};

        // Convert tasks object to array
        const tasks = Object.entries(db.data.tasks).map(([id, task]) => ({
            id,
            ...task
        }));

        res.json({
            success: true,
            tasks: tasks.length > 0 ? tasks : []
        });
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tasks',
            tasks: []
        });
    }
});

// POST /api/admin/tasks/seed-defaults - Seed default tasks
router.post('/api/admin/tasks/seed-defaults', (req, res) => {
    try {
        // Ensure tasks object exists
        if (!db.data) db.data = {};
        if (!db.data.tasks) db.data.tasks = {};

        // Check if tasks already exist
        const existingTasks = Object.keys(db.data.tasks);
        if (existingTasks.length > 0) {
            return res.json({
                success: true,
                message: 'Tasks already exist',
                count: existingTasks.length
            });
        }

        // Seed default tasks
        DEFAULT_TASKS.forEach(task => {
            db.data.tasks[task.id] = {
                name: task.name,
                icon: task.icon,
                url: task.url,
                reward: task.reward,
                gems: task.gems,
                type: task.type,
                completed: false,
                createdAt: new Date().toISOString()
            };
        });

        // Save to database
        db.save();

        res.json({
            success: true,
            message: 'Default tasks seeded successfully',
            count: DEFAULT_TASKS.length
        });
    } catch (error) {
        console.error('Error seeding tasks:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to seed tasks'
        });
    }
});

// POST /api/complete-task - Complete a task
router.post('/api/complete-task', (req, res) => {
    try {
        const { userId, taskId, reward } = req.body;

        if (!userId || !taskId) {
            return res.status(400).json({
                success: false,
                message: 'Missing userId or taskId'
            });
        }

        // Get user
        const user = db.data.users[userId];
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if task exists
        const task = db.data.tasks[taskId];
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Initialize user.tasksDone if not exists (canonical field used by main system)
        if (!user.tasksDone) user.tasksDone = [];
        // Also support legacy completedTasks alias
        if (!user.completedTasks) user.completedTasks = [];

        // Check if already completed (check both fields for compatibility)
        if (user.tasksDone.includes(taskId) || user.completedTasks.includes(taskId)) {
            return res.json({
                success: false,
                message: 'Task already completed'
            });
        }

        // Mark task as completed in both fields for cross-compatibility
        user.tasksDone.push(taskId);
        user.completedTasks.push(taskId);

        // Add reward to user
        if (!user.tokens) user.tokens = 0;
        user.tokens += reward || task.reward || 0;
        // Sync all token balance fields
        user.balance_tokens = user.tokens;
        user.balance = user.tokens;

        // Fix gems sync - use canonical Gems field (capital G) to match main codebase
        const gemsReward = task.gems || 0;
        if (gemsReward > 0) {
            const currentGems = parseFloat(user.balance_Gems !== undefined ? user.balance_Gems : (user.Gems || 0));
            user.Gems = currentGems + gemsReward;
            user.balance_Gems = user.Gems;
        }

        // Save
        db.save();

        res.json({
            success: true,
            message: 'Task completed successfully',
            reward: reward || task.reward,
            gems: task.gems
        });
    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete task'
        });
    }
});

// POST /api/admin/tasks - Create a new task (admin only)
router.post('/api/admin/tasks', (req, res) => {
    try {
        const { name, icon, url, reward, gems, type } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Task name is required'
            });
        }

        // Ensure tasks object exists
        if (!db.data) db.data = {};
        if (!db.data.tasks) db.data.tasks = {};

        // Generate task ID
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create task
        db.data.tasks[taskId] = {
            name,
            icon: icon || '',
            url: url || '',
            reward: reward || 10,
            gems: gems || 1,
            type: type || 'general',
            completed: false,
            createdAt: new Date().toISOString()
        };

        // Save
        db.save();

        res.json({
            success: true,
            message: 'Task created successfully',
            task: { id: taskId, ...db.data.tasks[taskId] }
        });
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create task'
        });
    }
});

// PUT /api/admin/tasks/:id - Update a task (admin only)
router.put('/api/admin/tasks/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon, url, reward, gems, type } = req.body;

        // Ensure tasks object exists
        if (!db.data || !db.data.tasks || !db.data.tasks[id]) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }

        // Update task
        const task = db.data.tasks[id];
        if (name !== undefined) task.name = name;
        if (icon !== undefined) task.icon = icon;
        if (url !== undefined) task.url = url;
        if (reward !== undefined) task.reward = reward;
        if (gems !== undefined) task.gems = gems;
        if (type !== undefined) task.type = type;
        task.updatedAt = new Date().toISOString();

        // Save
        db.save();

        res.json({
            success: true,
            message: 'Task updated successfully',
            task: { id, ...task }
        });
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update task'
        });
    }
});

// DELETE /api/admin/tasks/:id - Delete a task (admin only)
router.delete('/api/admin/tasks/:id', (req, res) => {
    try {
        const { id } = req.params;

        // Ensure tasks object exists
        if (!db.data || !db.data.tasks || !db.data.tasks[id]) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }

        // Delete task
        delete db.data.tasks[id];

        // Save
        db.save();

        res.json({
            success: true,
            message: 'Task deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete task'
        });
    }
});

// Auto-seed default tasks on server start if none exist
function autoSeedTasks() {
    try {
        if (!db.data) db.data = {};
        if (!db.data.tasks) db.data.tasks = {};

        const existingTasks = Object.keys(db.data.tasks);
        if (existingTasks.length === 0) {
            console.log('🌱 No tasks found. Auto-seeding default tasks...');

            DEFAULT_TASKS.forEach(task => {
                db.data.tasks[task.id] = {
                    name: task.name,
                    icon: task.icon,
                    url: task.url,
                    reward: task.reward,
                    gems: task.gems,
                    type: task.type,
                    completed: false,
                    createdAt: new Date().toISOString()
                };
            });

            db.save();
            console.log(`✅ Auto-seeded ${DEFAULT_TASKS.length} default tasks successfully!`);
        } else {
            console.log(`📋 ${existingTasks.length} tasks already exist. Skipping auto-seed.`);
        }
    } catch (error) {
        console.error('❌ Error auto-seeding tasks:', error);
    }
}

// Run auto-seed after a short delay to ensure db is loaded
setTimeout(autoSeedTasks, 1000);

console.log('✅ Tasks API endpoints registered');

module.exports = router;
