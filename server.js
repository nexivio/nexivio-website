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
app.use(express.static(__dirname));

// Google Sheets Configuration
// You need to create a Google Service Account and add the credentials
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID || 'YOUR_SHEET_ID_HERE';
const SHEET_NAME = 'Sheet1';

// Initialize Google Sheets client
let sheets;
let auth;

async function initializeGoogleSheets() {
    try {
        // Check if we have credentials in environment variable
        const credentialsJson = process.env.GOOGLE_CREDENTIALS;
        
        if (credentialsJson) {
            const credentials = JSON.parse(credentialsJson);
            auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            sheets = google.sheets({ version: 'v4', auth });
            console.log('Google Sheets authenticated successfully');
            return true;
        } else {
            console.warn('Google Sheets credentials not configured. Using fallback mode.');
            return false;
        }
    } catch (error) {
        console.error('Error initializing Google Sheets:', error.message);
        return false;
    }
}

// Fallback: Store in memory if Google Sheets is not available
let subscribersData = [];

// API endpoint for subscription
app.post('/api/subscribe', async (req, res) => {
    try {
        const { fullName, email, organization, timestamp, source } = req.body;

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
            timestamp: timestamp || new Date().toISOString(),
            fullName,
            email,
            organization: organization || 'N/A',
            source: source || 'website'
        };

        // Try to add to Google Sheets first
        if (sheets && GOOGLE_SHEETS_ID !== 'YOUR_SHEET_ID_HERE') {
            try {
                // Check for duplicate
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: GOOGLE_SHEETS_ID,
                    range: `${SHEET_NAME}!A2:E`
                });

                const rows = response.data.values || [];
                const isDuplicate = rows.some((row, idx) => idx > 0 && row[2] === email);

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

                console.log(`New subscriber added to Google Sheets: ${email} (${fullName})`);
            } catch (sheetsError) {
                console.error('Error adding to Google Sheets:', sheetsError.message);
                // Fall back to in-memory storage
                subscribersData.push(newSubscriber);
            }
        } else {
            // Fallback: Store in memory
            const isDuplicate = subscribersData.some(sub => sub.email === email);
            if (isDuplicate) {
                return res.status(400).json({ error: 'This email is already subscribed' });
            }
            subscribersData.push(newSubscriber);
            console.log(`New subscriber (fallback): ${email} (${fullName})`);
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
        console.error('Error processing subscription:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get subscriber count
app.get('/api/stats', async (req, res) => {
    try {
        let count = 0;

        if (sheets && GOOGLE_SHEETS_ID !== 'YOUR_SHEET_ID_HERE') {
            try {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: GOOGLE_SHEETS_ID,
                    range: `${SHEET_NAME}!A2:A`
                });

                const rows = response.data.values || [];
                count = Math.max(0, rows.length - 1); // Subtract header row
            } catch (sheetsError) {
                console.error('Error getting stats from Google Sheets:', sheetsError.message);
                count = subscribersData.length;
            }
        } else {
            count = subscribersData.length;
        }

        res.json({ totalSubscribers: count });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get all subscribers (for admin)
app.get('/api/subscribers', async (req, res) => {
    try {
        let subscribers = [];

        if (sheets && GOOGLE_SHEETS_ID !== 'YOUR_SHEET_ID_HERE') {
            try {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: GOOGLE_SHEETS_ID,
                    range: `${SHEET_NAME}!A2:E`
                });

                const rows = response.data.values || [];
                if (rows.length > 1) {
                    subscribers = rows.slice(1).map(row => ({
                        timestamp: row[0] || '',
                        fullName: row[1] || '',
                        email: row[2] || '',
                        organization: row[3] || '',
                        source: row[4] || ''
                    }));
                }
            } catch (sheetsError) {
                console.error('Error getting subscribers from Google Sheets:', sheetsError.message);
                subscribers = subscribersData;
            }
        } else {
            subscribers = subscribersData;
        }

        res.json({ subscribers, count: subscribers.length });
    } catch (error) {
        console.error('Error getting subscribers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'NEXIVIO Newsletter Service',
        googleSheetsConfigured: sheets ? true : false,
        fallbackMode: subscribersData.length > 0
    });
});

// Initialize on startup
async function startServer() {
    const googleSheetsReady = await initializeGoogleSheets();
    
    if (!googleSheetsReady) {
        console.log('⚠️  Google Sheets not configured. Using fallback in-memory storage.');
        console.log('To enable Google Sheets integration:');
        console.log('1. Create a Google Service Account');
        console.log('2. Create a Google Sheet with columns: Timestamp, Full Name, Email, Organization, Source');
        console.log('3. Set environment variables:');
        console.log('   - GOOGLE_SHEETS_ID: Your spreadsheet ID');
        console.log('   - GOOGLE_CREDENTIALS: Your service account JSON (as string)');
    }

    app.listen(PORT, () => {
        console.log(`NEXIVIO Server running on port ${PORT}`);
        console.log(`Google Sheets ID: ${GOOGLE_SHEETS_ID}`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
