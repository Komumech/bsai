const { google } = require('googleapis');
require('dotenv').config(); // Load environment variables from your .env file

// Configure OAuth2 client using environment variables
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Define the scopes needed for Google Calendar access.
// 'https://www.googleapis.com/auth/calendar' provides full read/write access to calendars.
// Choose scopes carefully based on the minimum permissions your app needs.
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Generates a Google OAuth2 authorization URL.
 * Redirect users to this URL to get their consent for accessing their Google Calendar.
 * @returns {string} The authorization URL.
 */
function generateAuthUrl() {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', // Request a refresh token for long-lived access
    scope: CALENDAR_SCOPES,
    prompt: 'consent' // Always prompt for user consent, useful for testing/re-authentication
  });
  return authUrl;
}

/**
 * Exchanges the authorization code received from Google for access and refresh tokens.
 * @param {string} code The authorization code from Google's redirect.
 * @returns {Object} An object containing access_token, refresh_token (if applicable), and expiry_date.
 */
async function getTokensFromCode(code) {
  const { tokens } = await oAuth2Client.getToken(code);
  // It's crucial to save `tokens.refresh_token` in your database
  // associated with the user for future API calls without re-authentication.
  // The `oAuth2Client.setCredentials(tokens)` line below is for the current instance
  // and will automatically handle access token refreshing if a refresh_token is present.
  oAuth2Client.setCredentials(tokens);
  return tokens;
}

/**
 * Creates a new event in the user's Google Calendar.
 * @param {Object} userAuthTokens An object containing the user's access_token and refresh_token.
 * @param {Object} eventDetails The event resource object as defined by Google Calendar API.
 * Example: {
 * summary: 'Eco-Friendly Workshop',
 * location: 'Online',
 * description: 'Learn about sustainable living practices.',
 * start: { dateTime: '2025-08-10T10:00:00-07:00', timeZone: 'America/Los_Angeles' },
 * end: { dateTime: '2025-08-10T11:00:00-07:00', timeZone: 'America/Los_Angeles' },
 * attendees: [{ email: 'attendee@example.com' }],
 * reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 24 * 60 }] }
 * }
 * @returns {Object} The created event resource from Google Calendar API.
 */
async function createCalendarEvent(userAuthTokens, eventDetails) {
  // Create a temporary OAuth2 client instance for this specific user's tokens.
  // This ensures that API calls are made on behalf of the correct user.
  const tempOAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  tempOAuth2Client.setCredentials(userAuthTokens);

  const calendar = google.calendar({ version: 'v3', auth: tempOAuth2Client });

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary', // 'primary' refers to the user's default calendar
      resource: eventDetails,
      sendUpdates: 'all' // Options: 'all', 'externalOnly', 'none' for sending notifications
    });
    return res.data; // Return the created event data
  } catch (error) {
    console.error('Error creating calendar event:', error.message);
    throw error; // Re-throw the error for handling in the calling route
  }
}

// Export the functions to be used in other parts of your application (e.g., index.js)
module.exports = {
  generateAuthUrl,
  getTokensFromCode,
  createCalendarEvent,
  // You can add more Google Calendar API functions here (e.g., listEvents, updateEvent, deleteEvent)
};
