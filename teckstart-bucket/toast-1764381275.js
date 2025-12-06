// Toast Notification System
const Toast = {
    show(message, type = 'info') {
        try {
            if (!message || typeof message !== 'string') {
                console.warn('Toast: Invalid message');
                return;
            }
            
            const validTypes = ['info', 'success', 'error', 'warning'];
            if (!validTypes.includes(type)) {
                type = 'info';
            }
            
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            
            const container = document.getElementById('toast-container') || this.createContainer();
            if (!container) {
                console.warn('Toast: Failed to create container');
                return;
            }
            
            container.appendChild(toast);
            
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    try {
                        toast.remove();
                    } catch (e) {
                        console.warn('Toast: Failed to remove element');
                    }
                }, 300);
            }, 3000);
        } catch (error) {
            console.error('Toast error:', error.message);
        }
    },
    
    createContainer() {
        try {
            if (!document.body) {
                console.warn('Toast: document.body not available');
                return null;
            }
            
            const container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
            return container;
        } catch (error) {
            console.error('Toast: Failed to create container:', error.message);
            return null;
        }
    },
    
    success(message) { this.show(message, 'success'); },
    error(message) { this.show(message, 'error'); },
    warning(message) { this.show(message, 'warning'); },
    info(message) { this.show(message, 'info'); }
};
