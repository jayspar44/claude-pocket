require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const logger = require('./logger');

const app = express();

const apiRoutes = require('./routes/api');

// Trust proxy configuration (environment-specific)
// Production/Dev: Trust exactly 1 proxy hop (Cloud Run load balancer)
// Local: No proxy, use direct IP addresses
if (process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Security Middleware
app.use(helmet());

// Global Rate Limiting (DDoS protection)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : [
        'http://localhost:4000',
        'http://localhost:5173',
        'capacitor://localhost'
    ];

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());

// HTTP request logging middleware (attaches req.log to all requests)
app.use(pinoHttp({
    logger,
    autoLogging: false, // Disable automatic request/response logging
    quietReqLogger: true,
    // Only include minimal request info when we do log
    serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode })
    }
}));

// Routes
app.use('/api', apiRoutes);

// Basic route
app.get('/', (req, res) => {
    res.send('Backend Running');
});

// Start server
const PORT = process.env.PORT || 4001;
const HOST = '0.0.0.0'; // Bind to all interfaces for Android emulator access
app.listen(PORT, HOST, () => {
    logger.info(`Server running on ${HOST}:${PORT}`);
});
