// Floating Read Later Saver - Auto-appears when scrolling
(function() {
    'use strict';
    
    // Configuration
    const API_URL = 'https://read-later-backend.onrender.com/api/articles';
    const SCROLL_THRESHOLD = 100; // Show after scrolling 100px
    
    // Check if already loaded
    if (window.readLaterFloatingButton) return;
    window.readLaterFloatingButton = true;
    
    // Create floating button
    const button = document.createElement('div');
    button.id = 'read-later-float-btn';
    button.innerHTML = `
        <div style="
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 999999;
            box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            font-size: 24px;
            color: white;
            user-select: none;
        " class="read-later-btn">
            📚
        </div>
    `;
    
    const floatingBtn = button.firstElementChild;
    document.body.appendChild(button);
    
    // Scroll handler to show/hide button
    let isVisible = false;
    let scrollTimeout;
    
    function handleScroll() {
        clearTimeout(scrollTimeout);
        
        const shouldShow = window.scrollY > SCROLL_THRESHOLD;
        
        if (shouldShow && !isVisible) {
            isVisible = true;
            floatingBtn.style.transform = 'translateY(0)';
            floatingBtn.style.opacity = '1';
        } else if (!shouldShow && isVisible) {
            isVisible = false;
            floatingBtn.style.transform = 'translateY(100px)';
            floatingBtn.style.opacity = '0';
        }
        
        // Auto-hide after 3 seconds of no scrolling
        scrollTimeout = setTimeout(() => {
            if (isVisible && window.scrollY > SCROLL_THRESHOLD) {
                floatingBtn.style.opacity = '0.7';
            }
        }, 3000);
    }
    
    // Show button on hover
    floatingBtn.addEventListener('mouseenter', () => {
        if (isVisible) {
            floatingBtn.style.opacity = '1';
            floatingBtn.style.transform = 'translateY(0) scale(1.1)';
        }
    });
    
    floatingBtn.addEventListener('mouseleave', () => {
        if (isVisible) {
            floatingBtn.style.transform = 'translateY(0) scale(1)';
        }
    });
    
    // Save article function
    async function saveArticle() {
        // Visual feedback
        floatingBtn.innerHTML = '💾';
        floatingBtn.style.transform = 'translateY(0) scale(0.9)';
        
        try {
            // Extract article data
            const title = document.title || '';
            const url = window.location.href;
            const description = document.querySelector('meta[name="description"]');
            const excerpt = description ? description.content : '';
            
            // Show saving status
            showNotification('📚 Saving article...', 'info');
            
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: url,
                    title: title,
                    excerpt: excerpt
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('✅ Article saved to Read Later!', 'success');
                floatingBtn.innerHTML = '✅';
                
                // Reset button after 2 seconds
                setTimeout(() => {
                    floatingBtn.innerHTML = '📚';
                    floatingBtn.style.transform = 'translateY(0) scale(1)';
                }, 2000);
            } else {
                throw new Error(result.error || 'Failed to save article');
            }
            
        } catch (error) {
            console.error('Save error:', error);
            showNotification('❌ Failed to save: ' + error.message, 'error');
            
            floatingBtn.innerHTML = '❌';
            setTimeout(() => {
                floatingBtn.innerHTML = '📚';
                floatingBtn.style.transform = 'translateY(0) scale(1)';
            }, 2000);
        }
    }
    
    // Notification system
    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 1000000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 300px;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Slide in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        // Slide out and remove
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    // Event listeners
    window.addEventListener('scroll', handleScroll, { passive: true });
    floatingBtn.addEventListener('click', saveArticle);
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearTimeout(scrollTimeout);
        }
    });
    
    console.log('📚 Read Later floating button loaded! Scroll down to see it.');
})();