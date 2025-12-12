const express = require('express');
const request = require('supertest');
const JSZip = require('jszip');
const adminRoute = require('./routes/admin');
const { ObjectId } = require('mongodb');

// Helper to handle binary
const binaryParser = (res, callback) => {
    res.setEncoding('binary');
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
};

async function runTest() {
    console.log('Starting Manual Verification...');

    // Mock DB
    const mockCodex = [{ _id: 'c1', title: 'Codex 1' }];
    const mockBeastiary = [{ _id: 'b1', name: 'Beast 1' }];

    const mockDb = {
        listCollections: () => ({
            toArray: async () => [
                { name: 'entities_pf1e' },
                { name: 'codex_entries' },
                { name: 'rules_pf1e' }
            ]
        }),
        collection: (name) => {
            if (name === 'entities_pf1e') return { find: () => ({ toArray: async () => mockBeastiary }) };
            if (name === 'codex_entries') return { find: () => ({ toArray: async () => mockCodex }) };
            return { find: () => ({ toArray: async () => [] }) };
        }
    };

    const app = express();
    app.use('/admin', adminRoute(mockDb));

    try {
        const res = await request(app)
            .get('/admin/backup')
            .buffer()
            .parse(binaryParser)
            .expect(200);

        console.log('Got response. Content-Type:', res.headers['content-type']);

        const zip = await JSZip.loadAsync(res.body);
        const files = Object.keys(zip.files);
        console.log('ZIP Files:', files);

        if (files.includes('codex.json')) {
            const content = await zip.file('codex.json').async('string');
            console.log('codex.json content:', content);
            if (JSON.parse(content)[0]._id === 'c1') {
                console.log('SUCCESS: codex.json verified.');
            } else {
                console.error('FAILURE: codex.json content mismatch.');
            }
        } else {
            console.error('FAILURE: codex.json missing.');
        }

    } catch (err) {
        console.error('Test Failed:', err);
    }
}

runTest();
