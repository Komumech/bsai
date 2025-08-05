const express = require("express");
const cors = require("cors");
const path = require("path"); // Import the 'path' module
const { talkAs } = require("./aiAgent");
const {
  generateAuthUrl,
  getTokensFromCode,
  createCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
} = require("./googleCalendarService");

const app = express();
app.use(cors());
app.use(express.json());

// --- FIX: Corrected Paths for Public Folder ---
// Go up one directory from 'server', then into 'client', then into 'public'
const publicPath = path.join(__dirname, '..', 'client', 'public');
const indexPath = path.join(publicPath, 'index.html'); // index.html is inside public

console.log(`DEBUG: Serving static files from: ${publicPath}`);
console.log(`DEBUG: Attempting to serve index.html from: ${indexPath}`);
// --- End Corrected Paths ---


// --- Serve static files from the 'public' directory ---
app.use(express.static(publicPath));

// --- Serve index.html for the root path ---
app.get('/', (req, res) => {
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`ERROR: Failed to send index.html: ${err.message}`);
      res.status(500).send('Server Error: Could not load the application interface.');
    } else {
      console.log('DEBUG: Successfully sent index.html');
    }
  });
});

// --- NEW: Endpoint to serve Firebase configuration to the frontend ---
// This mimics how the Canvas environment provides Firebase config.
app.get('/_app/firebase/config', (req, res) => {
  // In a real application, you would load your Firebase config from a secure source
  // (e.g., environment variables, a config file not exposed publicly).
  // For local testing, ensure your .env has these values.
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY, // You need to add this to your .env
    authDomain: process.env.FIREBASE_AUTH_DOMAIN, // You need to add this to your .env
    projectId: process.env.FIREBASE_PROJECT_ID, // You need to add this to your .env
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // You need to add this to your .env
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID, // You need to add this to your .env
    appId: process.env.FIREBASE_APP_ID, // You need to add this to your .env
    measurementId: process.env.FIREBASE_MEASUREMENT_ID // Optional
  };

  // Also provide the __app_id for Firestore paths
  const appId = process.env.APP_ID || 'default-app-id'; // Add APP_ID to your .env

  // Only send valid config properties
  const validConfig = Object.fromEntries(
    Object.entries(firebaseConfig).filter(([key, value]) => value !== undefined)
  );

  res.json(validConfig);
});


// Middleware to Simulate User Authentication and Token Retrieval
const userTokensStore = {}; // Stores tokens by a hypothetical userId
app.use((req, res, next) => {
  const userId = "demoUser123";
  req.userTokens = userTokensStore[userId];
  next();
});

// --- Google Calendar OAuth Routes ---
app.get("/auth/google/calendar", (req, res) => {
  const authUrl = generateAuthUrl();
  res.redirect(authUrl);
});

app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.redirect('/?auth_error=true&message=Authorization%20code%20missing.');
  }

  try {
    const tokens = await getTokensFromCode(code);
    const userId = "demoUser123";
    userTokensStore[userId] = tokens;
    console.log("Successfully obtained Google Calendar tokens and stored for", userId, ":", tokens);
    res.redirect('/?auth_success=true');
  } catch (error) {
    console.error("Error exchanging code for tokens:", error.message);
    res.redirect(`/?auth_error=true&message=${encodeURIComponent(error.message)}`);
  }
});

// --- Existing Google Calendar Event Management API Endpoints (CRUD) ---
function checkUserTokens(req, res, next) {
  if (!req.userTokens || !req.userTokens.access_token) {
    return res.status(401).json({ error: "User not authenticated with Google Calendar. Please connect your account first." });
  }
  next();
}

app.post("/api/calendar/events", checkUserTokens, async (req, res) => {
  const { eventDetails, calendarId } = req.body;
  if (!eventDetails || !eventDetails.summary || !eventDetails.start || !eventDetails.end) {
    return res.status(400).json({ error: "Missing required event details (summary, start, end)." });
  }
  try {
    const event = await createCalendarEvent(req.userTokens, eventDetails, calendarId);
    res.status(201).json({
      message: "Event created successfully!",
      eventId: event.id,
      htmlLink: event.htmlLink,
      event: event
    });
  } catch (error) {
    console.error("Failed to create calendar event:", error.message);
    res.status(500).json({ error: `Failed to create calendar event: ${error.message}` });
  }
});

app.get("/api/calendar/events", checkUserTokens, async (req, res) => {
  const { calendarId, timeMin, maxResults, singleEvents, orderBy } = req.query;
  const options = {
    timeMin: timeMin || new Date().toISOString(),
    maxResults: parseInt(maxResults) || 10,
    singleEvents: singleEvents === 'true',
    orderBy: orderBy || 'startTime',
  };
  try {
    const events = await listCalendarEvents(req.userTokens, calendarId, options);
    res.status(200).json({ events });
  } catch (error) {
    console.error("Failed to list calendar events:", error.message);
    res.status(500).json({ error: `Failed to list calendar events: ${error.message}` });
  }
});

app.put("/api/calendar/events/:eventId", checkUserTokens, async (req, res) => {
  const { eventId } = req.params;
  const { updatedEventDetails, calendarId } = req.body;
  if (!updatedEventDetails) {
    return res.status(400).json({ error: "Missing updated event details." });
  }
  try {
    const event = await updateCalendarEvent(req.userTokens, eventId, updatedEventDetails, calendarId);
    res.status(200).json({
      message: "Event updated successfully!",
      eventId: event.id,
      htmlLink: event.htmlLink,
      event: event
    });
  } catch (error) {
    console.error("Failed to update calendar event:", error.message);
    res.status(500).json({ error: `Failed to update calendar event: ${error.message}` });
  }
});

app.delete("/api/calendar/events/:eventId", checkUserTokens, async (req, res) => {
  const { eventId } = req.params;
  const { calendarId } = req.body;
  try {
    await deleteCalendarEvent(req.userTokens, eventId, calendarId);
    res.status(204).send();
  }
  catch (error) {
    console.error("Failed to delete calendar event:", error.message);
    res.status(500).json({ error: `Failed to delete calendar event: ${error.message}` });
  }
});


// --- AI Chat Route (Existing with Retry Logic) ---
app.post("/chat", async (req, res) => {
  const { input } = req.body;

  if (!input || typeof input !== "string") {
    return res.status(400).json({ error: "Invalid input provided." });
  }

  const MAX_RETRIES = 3;
  let formattedResponse = "";
  let responseGeneratedSuccessfully = false;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES && !responseGeneratedSuccessfully) {
    try {
      formattedResponse = await talkAs("Ada", input, req.userTokens);

      if (formattedResponse.includes("I've successfully added") || !formattedResponse.includes("1. Idea Name: N/A")) {
        responseGeneratedSuccessfully = true;
      } else {
        console.warn(`Retry ${retryCount + 1}: AI response was incomplete for ideas or unexpected. Retrying...`);
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    } catch (err) {
      console.error(`Attempt ${retryCount + 1} failed during AI response generation:`, err.message);
      retryCount++;
      if (retryCount >= MAX_RETRIES) {
        return res.status(500).json({
          conversation: [
            {
              sender: "⚠️ Error",
              text: `Failed to get a complete AI response after ${MAX_RETRIES} attempts due to an API error: ${err.message || "Please check your server or API key."}`,
            },
          ],
        });
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }

  if (!responseGeneratedSuccessfully) {
    return res.status(500).json({
      conversation: [
        {
          sender: "⚠️ Error",
          text: `Failed to get a complete AI response after ${MAX_RETRIES} attempts. Please try again or refine your request.`,
        },
      ],
    });
  }

  res.json({ conversation: [{ sender: "Ada", text: formattedResponse }] });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
