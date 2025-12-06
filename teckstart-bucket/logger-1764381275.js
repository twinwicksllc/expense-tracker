// CloudWatch Logger for Frontend
const Logger = {
    async log(level, message, context = {}) {
        const logEntry = {
            level: level,
            message: message,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            ...context
        };

        // Console log for immediate debugging
        const consoleMethod = {
            'ERROR': 'error',
            'WARN': 'warn',
            'INFO': 'log'
        }[level] || 'log';
        console[consoleMethod](message, context);

        // Send to backend for CloudWatch
        try {
            if (!CONFIG || !CONFIG.API_BASE_URL) {
                console.warn('Logger: CONFIG not available');
                return;
            }
            
            const token = getToken();
            if (!token) {
                console.warn('Logger: No auth token available');
                return;
            }
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`${CONFIG.API_BASE_URL}/logs`, {
                method: 'POST',
                mode: 'cors',
                credentials: 'same-origin',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify(logEntry),
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            if (!response.ok) {
                const responseBody = await response.text().catch(() => 'Unable to read response');
                console.warn(`Logger: Server returned ${response.status} ${response.statusText}`, { body: responseBody });
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                console.warn('Logger: Request timeout');
            } else {
                console.warn('Logger: Failed to send log:', e.message);
            }
        }
    }
};

['info', 'warn', 'error'].forEach(level => {
    Logger[level] = function(message, context) {
        return this.log(level.toUpperCase(), message, context);
    };
});
