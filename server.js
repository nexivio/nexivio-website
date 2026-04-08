// NEXIVIO Backend Server with Google Sheets Integration
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Google Sheets Configuration
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const SHEET_NAME = 'Sheet1';

// Initialize Google Sheets client
let sheets;
let auth;

async function initializeGoogleSheets() {
    try {
        const credentialsJson = process.env.GOOGLE_CREDENTIALS;
        
        if (credentialsJson) {
            const credentials = JSON.parse(credentialsJson);
            auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            sheets = google.sheets({ version: 'v4', auth });
            console.log('✅ Google Sheets authenticated successfully');
            return true;
        } else {
            console.warn('⚠️  Google Sheets credentials not configured');
            return false;
        }
    } catch (error) {
        console.error('❌ Error initializing Google Sheets:', error.message);
        return false;
    }
}

// Fallback: Store in memory if Google Sheets is not available
let subscribersData = [];

// API endpoint for subscription
app.post('/api/subscribe', async (req, res) => {
    try {
        const { fullName, email, organization } = req.body;

        // Validate required fields
        if (!fullName || !email) {
            return res.status(400).json({ error: 'Full name and email are required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        const newSubscriber = {
            timestamp: new Date().toISOString(),
            fullName,
            email,
            organization: organization || 'N/A',
            source: 'website'
        };

        // Try to add to Google Sheets
        if (sheets && GOOGLE_SHEETS_ID) {
            try {
                // Check for duplicate
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: GOOGLE_SHEETS_ID,
                    range: `${SHEET_NAME}!A2:E`
                });

                const rows = response.data.values || [];
                const isDuplicate = rows.some(row => row[2] === email);

                if (isDuplicate) {
                    return res.status(400).json({ error: 'This email is already subscribed' });
                }

                // Append new row
                await sheets.spreadsheets.values.append({
                    spreadsheetId: GOOGLE_SHEETS_ID,
                    range: `${SHEET_NAME}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [[
                            newSubscriber.timestamp,
                            newSubscriber.fullName,
                            newSubscriber.email,
                            newSubscriber.organization,
                            newSubscriber.source
                        ]]
                    }
                });

                console.log(`✅ New subscriber: ${email} (${fullName})`);
            } catch (sheetsError) {
                console.error('⚠️  Error adding to Google Sheets:', sheetsError.message);
                subscribersData.push(newSubscriber);
            }
        } else {
            // Fallback: Store in memory
            const isDuplicate = subscribersData.some(sub => sub.email === email);
            if (isDuplicate) {
                return res.status(400).json({ error: 'This email is already subscribed' });
            }
            subscribersData.push(newSubscriber);
            console.log(`✅ New subscriber (fallback): ${email} (${fullName})`);
        }

        res.status(200).json({
            success: true,
            message: 'Successfully subscribed to newsletter',
            data: {
                email,
                fullName,
                timestamp: newSubscriber.timestamp
            }
        });

    } catch (error) {
        console.error('❌ Error processing subscription:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get subscriber count
app.get('/api/stats', async (req, res) => {
    try {
        let count = 0;

        if (sheets && GOOGLE_SHEETS_ID) {
            try {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: GOOGLE_SHEETS_ID,
                    range: `${SHEET_NAME}!A2:A`
                });

                const rows = response.data.values || [];
                count = rows.length;
            } catch (sheetsError) {
                count = subscribersData.length;
            }
        } else {
            count = subscribersData.length;
        }

        res.json({ totalSubscribers: count });
    } catch (error) {
        console.error('❌ Error getting stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'NEXIVIO Newsletter Service',
        googleSheetsConfigured: sheets ? true : false
    });
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize and start server
async function startServer() {
    await initializeGoogleSheets();
    
    app.listen(PORT, () => {
        console.log(`🚀 NEXIVIO Server running on port ${PORT}`);
        console.log(`📊 Google Sheets ID: ${GOOGLE_SHEETS_ID || 'Not configured'}`);
    });
}

startServer().catch(err => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
});
