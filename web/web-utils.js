/**
 * UNIFIED WEB UTILITIES
 * Combined: global-email-nav.js + layout-fix.js + upload-preview.js
 * 
 * Sections:
 * 1. Global Navigation Fallback
 * 2. Global Email Navigation
 * 3. Layout Fixes
 * 4. File Upload Preview
 */

// ==========================================
// SECTION 0: GLOBAL NAVIGATION FALLBACK
// ==========================================
// This ensures nav() works even before script.js loads
if (typeof window.nav !== 'function') {
    window.nav = function (targetId) {
        console.log('[nav] Navigating to:', targetId);
        // Hide all pages
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
            p.style.display = 'none';
        });
        // Show target page
        const target = document.getElementById(targetId + 'Page') || document.getElementById(targetId);
        if (target) {
            target.classList.add('active');
            target.style.display = 'block';
            console.log('[nav] Page shown:', targetId);
        } else {
            console.error('[nav] Page not found:', targetId);
        }
    };
    console.log('✅ Global nav() registered in web-utils.js');
}

// ==========================================
// SECTION 1: GLOBAL EMAIL NAVIGATION
// ==========================================

/**
 * Global Email Navigation Functions
 * These functions are called directly from HTML onclick events
 */

// Gmail direct navigation
function openGmailDirect() {
    console.log('[GLOBAL] openGmailDirect called');
    try {
        if (typeof nav === 'function') {
            nav('gmail');
        } else if (typeof showPage === 'function') {
            showPage('gmail');
        }

        if (typeof window !== 'undefined') {
            window._currentMailType = 'gmail';
        }

        // Try to call these functions if they exist
        if (typeof updateServiceMailBalance === 'function') {
            try { updateServiceMailBalance('gmail'); } catch (e) { }
        }
        if (typeof autoGenerateServiceMail === 'function') {
            try { autoGenerateServiceMail('gmail'); } catch (e) { }
        }
    } catch (e) {
        console.error('openGmailDirect error:', e);
    }
}

// Hotmail direct navigation
function openHotmailDirect() {
    console.log('[GLOBAL] openHotmailDirect called');
    try {
        if (typeof nav === 'function') {
            nav('hotMail');
        } else if (typeof showPage === 'function') {
            showPage('hotMail');
        }

        if (typeof window !== 'undefined') {
            window._currentMailType = 'hotmail';
        }

        if (typeof updateServiceMailBalance === 'function') {
            try { updateServiceMailBalance('hotmail'); } catch (e) { }
        }
        if (typeof autoGenerateServiceMail === 'function') {
            try { autoGenerateServiceMail('hotmail'); } catch (e) { }
        }
    } catch (e) {
        console.error('openHotmailDirect error:', e);
    }
}

// Student Email direct navigation
function openStudentEmailDirect() {
    console.log('[GLOBAL] openStudentEmailDirect called');
    try {
        if (typeof nav === 'function') {
            nav('studentMail');
        } else if (typeof showPage === 'function') {
            showPage('studentMail');
        }

        if (typeof window !== 'undefined') {
            window._currentMailType = 'student';
        }

        if (typeof updateServiceMailBalance === 'function') {
            try { updateServiceMailBalance('student'); } catch (e) { }
        }
        if (typeof autoGenerateServiceMail === 'function') {
            try { autoGenerateServiceMail('student'); } catch (e) { }
        }
    } catch (e) {
        console.error('openStudentEmailDirect error:', e);
    }
}

// Export to window for global access
if (typeof window !== 'undefined') {
    window.openGmailDirect = openGmailDirect;
    window.openHotmailDirect = openHotmailDirect;
    window.openStudentEmailDirect = openStudentEmailDirect;
    console.log('✅ Global email navigation functions loaded');
}

// ==========================================
// SECTION 2: LAYOUT FIXES
// ==========================================

(function () {
    'use strict';

    function fixDailyBonusLayout() {
        const dailyPage = document.getElementById('dailyPage') || document.getElementById('daily');
        if (!dailyPage) return;

        const grid = dailyPage.querySelector('.grid-3, .daily-grid, [class*="grid"]');
        if (grid) {
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
            grid.style.gap = '8px';
            grid.style.maxWidth = '100%';
            grid.style.boxSizing = 'border-box';
        }

        const cards = dailyPage.querySelectorAll('.bonus-card, .day-card, [class*="card"]');
        cards.forEach(card => {
            card.style.maxWidth = '100%';
            card.style.boxSizing = 'border-box';
            card.style.padding = '10px';
        });

        const contentBody = dailyPage.querySelector('.content-body');
        if (contentBody) {
            contentBody.style.maxWidth = '100%';
            contentBody.style.padding = '12px';
            contentBody.style.boxSizing = 'border-box';
        }
    }

    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fixDailyBonusLayout);
    } else {
        fixDailyBonusLayout();
    }

    // Also run when navigating to daily page - properly wrap nav
    (function wrapNav() {
        // Wait until nav is defined on window (by script.js)
        if (typeof window.nav !== 'function' || window.nav._wrapped) {
            setTimeout(wrapNav, 100);
            return;
        }

        const originalNav = window.nav;
        window.nav = function (page) {
            // Call original nav first
            try {
                originalNav(page);
            } catch (e) {
                console.error('Error in original nav:', e);
            }

            // Apply layout fix for daily page
            if (page === 'daily' || page === 'dailyPage') {
                setTimeout(fixDailyBonusLayout, 100);
            }
        };
        window.nav._wrapped = true;
        console.log('✅ Nav wrapper applied successfully');
    })();

    console.log('✅ Layout fix script loaded');
})();

// ==========================================
// SECTION 3: FILE UPLOAD PREVIEW
// ==========================================

/**
 * File Upload Preview Handler
 * ChatGPT-style file preview with thumbnail and remove button
 */

class FileUploadPreview {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            maxFiles: options.maxFiles || 5,
            allowedTypes: options.allowedTypes || ['image/*', 'video/*'],
            maxSize: options.maxSize || 50 * 1024 * 1024, // 50MB
            onFileAdd: options.onFileAdd || (() => { }),
            onFileRemove: options.onFileRemove || (() => { }),
            onError: options.onError || (() => { })
        };
        this.files = [];

        this.init();
    }

    init() {
        if (!this.container) return;

        // Create upload area
        this.uploadArea = document.createElement('div');
        this.uploadArea.className = 'upload-area';
        this.uploadArea.innerHTML = `
            <i class="fas fa-plus"></i>
            <span>Upload</span>
            <input type="file" accept="${this.options.allowedTypes.join(',')}" multiple>
        `;

        // Create preview container
        this.previewContainer = document.createElement('div');
        this.previewContainer.className = 'upload-preview-container';

        this.container.appendChild(this.previewContainer);
        this.previewContainer.appendChild(this.uploadArea);

        // Bind events
        this.bindEvents();
    }

    bindEvents() {
        // Click to upload
        this.uploadArea.addEventListener('click', () => {
            const input = this.uploadArea.querySelector('input[type="file"]');
            input.click();
        });

        // File selection
        const input = this.uploadArea.querySelector('input[type="file"]');
        input.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
            input.value = ''; // Reset input
        });

        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.style.borderColor = 'var(--accent-color, #f59e0b)';
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.style.borderColor = '';
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.style.borderColor = '';
            this.handleFiles(e.dataTransfer.files);
        });
    }

    handleFiles(fileList) {
        Array.from(fileList).forEach(file => {
            // Check max files
            if (this.files.length >= this.options.maxFiles) {
                this.options.onError(`Maximum ${this.options.maxFiles} files allowed`);
                return;
            }

            // Check file type
            const isAllowed = this.options.allowedTypes.some(type => {
                if (type.includes('/*')) {
                    return file.type.startsWith(type.split('/')[0]);
                }
                return file.type === type;
            });

            if (!isAllowed) {
                this.options.onError(`File type not allowed: ${file.name}`);
                return;
            }

            // Check file size
            if (file.size > this.options.maxSize) {
                this.options.onError(`File too large: ${file.name}`);
                return;
            }

            this.addFile(file);
        });
    }

    addFile(file) {
        const fileId = Date.now() + Math.random().toString(36).substr(2, 9);
        const fileData = {
            id: fileId,
            file: file,
            type: file.type.startsWith('video/') ? 'video' : 'image'
        };

        this.files.push(fileData);
        this.renderPreview(fileData);
        this.options.onFileAdd(fileData);
    }

    renderPreview(fileData) {
        const { id, file, type } = fileData;

        const previewItem = document.createElement('div');
        previewItem.className = `preview-item ${type}-preview`;
        previewItem.dataset.id = id;

        // Create preview content
        if (type === 'image') {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.onload = () => URL.revokeObjectURL(img.src);
            previewItem.appendChild(img);
        } else if (type === 'video') {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.preload = 'metadata';
            previewItem.appendChild(video);

            // Play icon overlay
            const playIcon = document.createElement('div');
            playIcon.className = 'play-icon';
            playIcon.innerHTML = '<i class="fas fa-play"></i>';
            previewItem.appendChild(playIcon);
        }

        // File info
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = `
            <div class="file-name">${file.name}</div>
            <div class="file-size">${this.formatFileSize(file.size)}</div>
        `;
        previewItem.appendChild(fileInfo);

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeFile(id);
        });
        previewItem.appendChild(removeBtn);

        // Insert before upload area
        this.previewContainer.insertBefore(previewItem, this.uploadArea);
    }

    removeFile(fileId) {
        const index = this.files.findIndex(f => f.id === fileId);
        if (index > -1) {
            const fileData = this.files[index];
            this.files.splice(index, 1);

            const previewItem = this.previewContainer.querySelector(`[data-id="${fileId}"]`);
            if (previewItem) {
                previewItem.remove();
            }

            this.options.onFileRemove(fileData);
        }
    }

    getFiles() {
        return this.files.map(f => f.file);
    }

    getFilesWithData() {
        return this.files;
    }

    clear() {
        this.files = [];
        const previews = this.previewContainer.querySelectorAll('.preview-item');
        previews.forEach(p => p.remove());
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.FileUploadPreview = FileUploadPreview;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileUploadPreview;
}

console.log('✅ Unified web utilities loaded');
