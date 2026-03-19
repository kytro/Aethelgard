const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Codex Admin API',
            version: '1.0.0',
            description: 'API for managing Pathfinder 1e entities, rules, spells, and Codex entries.',
        },
        servers: [
            {
                url: '/codex/api/v1',
                description: 'V1 API Server',
            },
            {
                url: '/codex/api',
                description: 'Legacy API Root',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    // Path to the API docs
    apis: ['./routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
