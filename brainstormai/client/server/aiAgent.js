const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.0-flash" });
const persona = "an expert business consultant and a creative innovator";

// Import the calendar service functions
const { createCalendarEvent } = require("./googleCalendarService");

/**
 * Formats the raw text response from the AI into structured business ideas.
 * This function remains largely the same, handling the business idea output.
 */
function formatResponse(text) {
  // Clean up extra whitespace and trim
  const cleanedText = text.replace(/\s+/g, ' ').trim();

  // Split the text into individual business ideas based on the numbered list format
  // This regex is robust to handle potential variations in numbering (1., 2., etc.)
  const ideaBlocks = cleanedText.split(/\d+\.\s*Idea Name:/).filter(block => block.trim() !== '');

  let textOutput = '';

  ideaBlocks.forEach((block, index) => {
    // Re-add "Idea Name:" to the beginning of the block for consistent parsing
    const fullBlock = `Idea Name:${block.trim()}`;

    // Regex patterns for extracting each section.
    // They look for the field name and then capture everything until the next field name or end of block.
    const ideaNameMatch = fullBlock.match(/Idea Name:\s*(.*?)(?=\s*Concept:|$)/i);
    const conceptMatch = fullBlock.match(/Concept:\s*(.*?)(?=\s*Key Features:|$)/i);
    const keyFeaturesMatch = fullBlock.match(/Key Features:\s*(.*?)(?=\s*Target Market:|$)/i);
    const targetMarketMatch = fullBlock.match(/Target Market:\s*(.*?)(?=\s*Unique Value Proposition:|$)/i);
    const uspMatch = fullBlock.match(/Unique Value Proposition:\s*(.*?)(?=\s*Monetization:|$)/i);
    const monetizationMatch = fullBlock.match(/Monetization:\s*(.*?)(?=\s*Potential Challenges\/Considerations:|$)/i);
    const challengesMatch = fullBlock.match(/Potential Challenges\/Considerations:\s*(.*?)(?=\s*Summary:|$)/i);
    const summaryMatch = fullBlock.match(/summary:\s*(.*)/i);

    // Extract and clean up the matched content, defaulting to 'N/A' if not found
    // Added an extra replace for common unwanted characters around the Idea Name
    const ideaName = ideaNameMatch ? ideaNameMatch[1].replace(/[\*\-]/g, '').trim() : `Idea ${index + 1}`;
    const concept = conceptMatch ? conceptMatch[1].trim() : 'N/A';
    const keyFeatures = keyFeaturesMatch ? keyFeaturesMatch[1].trim() : 'N/A';
    const targetMarket = targetMarketMatch ? targetMarketMatch[1].trim() : 'N/A';
    const usp = uspMatch ? uspMatch[1].trim() : 'N/A';
    const monetization = monetizationMatch ? monetizationMatch[1].trim() : 'N/A';
    const challenges = challengesMatch ? challengesMatch[1].trim() : 'N/A';
    const summary = summaryMatch ? summaryMatch[1].trim() : 'N/A';

    // Construct the formatted output for each idea with paragraphs and spacing
    textOutput += `
**${index + 1}. Idea Name:** ${ideaName}

  **Concept:** ${concept}

  **Key Features:** ${keyFeatures}

  **Target Market:** ${targetMarket}

  **Unique Value Proposition:** ${usp}

  **Monetization:** ${monetization}

  **Potential Challenges/Considerations:** ${challenges}

  **Summary:** ${summary}

---
`;
  });

  return textOutput.trim();
}

/**
 * Main function for the AI to respond, now capable of creating calendar events.
 * @param {string} persona The AI's persona.
 * @param {string} message The user's input message.
 * @param {Object} userAuthTokens User's Google Calendar authentication tokens.
 * @returns {string} A formatted response (either business ideas or event confirmation/error).
 */
async function talkAs(persona, message, userAuthTokens) {
  try {
    const now = new Date();
    const currentDateTime = now.toISOString();
    const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const prompt = `
You are "${persona}".

User Input: "${message}"

Instructions:
1.  **If the user's request is to schedule, add, or create a calendar event:**
    * **Respond ONLY with a JSON object.**
    * The JSON object MUST have a "type" field set to "calendar_event".
    * It MUST also include an "eventDetails" object with the following fields:
        * "summary": A concise title for the event.
        * "description": A detailed description of the event.
        * "start": An object with "dateTime" (ISO 8601 format, e.g., "2025-08-10T10:00:00-07:00") and "timeZone" (e.g., "America/Los_Angeles"). If the user specifies a date but no time, default to 9 AM. If no date, default to tomorrow.
        * "end": An object with "dateTime" and "timeZone". Default to 1 hour after start if not specified.
    * Use the current date/time context if relative times are given (e.g., "tomorrow", "next week"). Current date/time: ${currentDateTime}, TimeZone: ${currentTimeZone}.
    * Example JSON output for event:
        \`\`\`json
        {
          "type": "calendar_event",
          "eventDetails": {
            "summary": "Meeting with John",
            "description": "Discuss Q3 strategy.",
            "start": { "dateTime": "2025-08-01T14:00:00-07:00", "timeZone": "America/Los_Angeles" },
            "end": { "dateTime": "2025-08-01T15:00:00-07:00", "timeZone": "America/Los_Angeles" }
          }
        }
        \`\`\`
2.  **Otherwise (if not a calendar event request):**
    * **Generate 3 unique and actionable business ideas for a startup.**
    * **DO NOT include any conversational text, introductions, or additional headings.**
    * **ONLY provide the business ideas in the exact structure specified below.**
    * **All generated ideas MUST directly and explicitly address the provided Industry, Target Audience, AND Problem. If an idea does not fit ALL THREE, do NOT generate it.**
    * **Ensure each idea is distinct, innovative, and presented in clear bullet points.**
    * **The 'Idea Name' should be a clean title, without any extra bolding, hyphens, or special characters *around* the name itself.**

    For each idea, provide the following structure, ensuring each description is at least 2-3 sentences long where applicable, and bullet points are used for lists within sections like Key Features:
    **1. Idea Name:** [Creative Name]
      - **Concept:** [A detailed, 2-3 sentence description of the core idea, its purpose, and how it addresses the SPECIFIC problem of finding affordable, space-saving, and aesthetically pleasing eco-friendly products for small urban living spaces. It must be a tangible product or a service directly related to acquiring/managing such products.]
      - **Key Features:** [List 3-5 specific functionalities or core offerings of the product/service. Focus on aspects that highlight space-saving design, affordability, aesthetic appeal, and eco-friendliness.]
      - **Target Market:** [A detailed description of Young Professionals (25-35) living in urban apartments, emphasizing their unique needs related to small spaces, affordability, and desire for eco-friendly aesthetics.]
      - **Unique Value Proposition:** [A comprehensive explanation (2-3 sentences) of what truly differentiates this idea from competitors and why the target market would choose it, specifically highlighting how it solves their pain points around space, cost, aesthetics, and eco-friendliness.]
      - **Monetization:** [Describe 2-3 specific revenue streams and how they would work, e.g., subscription tiers, premium features, transaction fees, advertising.]
      - **Potential Challenges/Considerations:** [Identify 1-2 potential hurdles or important factors to consider for implementation, e.g., sourcing genuinely affordable eco-materials, manufacturing efficiency, urban logistics for product delivery/returns, market education.]
      - **Summary:** [A brief, concise, yet slightly expanded (1-2 sentences) overview of the entire idea.]

    **2. Idea Name:** [Creative Name]
      - **Concept:** [A detailed, 2-3 sentence description of the core idea, its purpose, and how it addresses the SPECIFIC problem of finding affordable, space-saving, and aesthetically pleasing eco-friendly products for small urban living spaces. It must be a tangible product or a service directly related to acquiring/managing such products.]
      - **Key Features:** [List 3-5 specific functionalities or core offerings of the product/service. Focus on aspects that highlight space-saving design, affordability, aesthetic appeal, and eco-friendliness.]
      - **Target Market:** [A detailed description of Young Professionals (25-35) living in urban apartments, emphasizing their unique needs related to small spaces, affordability, and desire for eco-friendly aesthetics.]
      - **Unique Value Proposition:** [A comprehensive explanation (2-3 sentences) of what truly differentiates this idea from competitors and why the target market would choose it, specifically highlighting how it solves their pain points around space, cost, aesthetics, and eco-friendliness.]
      - **Monetization:** [Describe 2-3 specific revenue streams and how they would work, e.g., subscription tiers, premium features, transaction fees, advertising.]
      - **Potential Challenges/Considerations:** [Identify 1-2 potential hurdles or important factors to consider for implementation, e.g., sourcing genuinely affordable eco-materials, manufacturing efficiency, urban logistics for product delivery/returns, market education.]
      - **Summary:** [A brief, concise, yet slightly expanded (1-2 sentences) overview of the entire idea.]

    **3. Idea Name:** [Creative Name]
      - **Concept:** [A detailed, 2-3 sentence description of the core idea, its purpose, and how it addresses the SPECIFIC problem of finding affordable, space-saving, and aesthetically pleasing eco-friendly products for small urban living spaces. It must be a tangible product or a service directly related to acquiring/managing such products.]
      - **Key Features:** [List 3-5 specific functionalities or core offerings of the product/service. Focus on aspects that highlight space-saving design, affordability, aesthetic appeal, and eco-friendliness.]
      - **Target Market:** [A detailed description of Young Professionals (25-35) living in urban apartments, emphasizing their unique needs related to small spaces, affordability, and desire for eco-friendly aesthetics.]
      - **Unique Value Proposition:** [A comprehensive explanation (2-3 sentences) of what truly differentiates this idea from competitors and why the target market would choose it, specifically highlighting how it solves their pain points around space, cost, aesthetics, and eco-friendliness.]
      - **Monetization:** [Describe 2-3 specific revenue streams and how they would work, e.g., subscription tiers, premium features, transaction fees, advertising.]
      - **Potential Challenges/Considerations:** [Identify 1-2 potential hurdles or important factors to consider for implementation, e.g., sourcing genuinely affordable eco-materials, manufacturing efficiency, urban logistics for product delivery/returns, market education.]
      - **Summary:** [A brief, concise, yet slightly expanded (1-2 sentences) overview of the entire idea.]
    `;

    const result = await model.generateContent(prompt);
    const rawResponse = result.response.text();

    // --- NEW PARSING LOGIC ---
    // Attempt to extract a JSON block from the raw response first.
    // This regex looks for a JSON block within backticks (```json ... ```)
    const jsonMatch = rawResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsedResponse = JSON.parse(jsonMatch[1]); // Parse only the extracted JSON string
        if (parsedResponse.type === "calendar_event" && parsedResponse.eventDetails) {
          // If it's a calendar event request, attempt to create the event
          if (!userAuthTokens || !userAuthTokens.access_token) {
            return "I can help schedule that, but I need access to your Google Calendar. Please connect your Google account first by visiting /auth/google/calendar.";
          }

          const eventDetails = parsedResponse.eventDetails;

          // Basic validation and default values for event times if AI didn't provide them fully
          if (!eventDetails.start || !eventDetails.end || !eventDetails.start.dateTime || !eventDetails.end.dateTime) {
              const defaultStart = new Date();
              defaultStart.setDate(defaultStart.getDate() + 1); // Default to tomorrow
              defaultStart.setHours(9, 0, 0, 0); // Default to 9 AM

              const defaultEnd = new Date(defaultStart);
              defaultEnd.setHours(defaultStart.getHours() + 1); // Default to 1 hour duration

              eventDetails.start = { dateTime: defaultStart.toISOString(), timeZone: eventDetails.timeZone || currentTimeZone };
              eventDetails.end = { dateTime: defaultEnd.toISOString(), timeZone: eventDetails.timeZone || currentTimeZone };
          }

          // Convert AI's potential date format (YYYYMMDDTHH:MM:SS+-HH:MM) to ISO 8601
          // This is a basic conversion and might need more robust handling for all edge cases
          if (eventDetails.start && eventDetails.start.dateTime && !eventDetails.start.dateTime.includes('-') && !eventDetails.start.dateTime.includes(':')) {
              const dt = eventDetails.start.dateTime;
              eventDetails.start.dateTime = `${dt.substring(0,4)}-${dt.substring(4,6)}-${dt.substring(6,8)}T${dt.substring(9,11)}:${dt.substring(11,13)}:${dt.substring(13,15)}${dt.substring(15)}`;
          }
          if (eventDetails.end && eventDetails.end.dateTime && !eventDetails.end.dateTime.includes('-') && !eventDetails.end.dateTime.includes(':')) {
            const dt = eventDetails.end.dateTime;
            eventDetails.end.dateTime = `${dt.substring(0,4)}-${dt.substring(4,6)}-${dt.substring(6,8)}T${dt.substring(9,11)}:${dt.substring(11,13)}:${dt.substring(13,15)}${dt.substring(15)}`;
          }


          const event = await createCalendarEvent(userAuthTokens, eventDetails);
          return `I've successfully added "${event.summary}" to your Google Calendar! You can view it here: ${event.htmlLink}`;
        }
      } catch (jsonParseError) {
        // If JSON parsing fails or the structure is not a calendar_event,
        // it means the AI tried to output JSON but it was malformed or not the expected type.
        console.warn("AI attempted JSON output, but it was invalid or not a calendar event:", jsonParseError.message);
        // Fall through to business idea formatting
      }
    }

    // If no valid calendar_event JSON was found, or if parsing failed,
    // assume it's a business idea response and format it.
    const formatted = formatResponse(rawResponse);
    return formatted;

  } catch (err) {
    console.error("Gemini error:", err.message);
    return `⚠️ ${persona} failed to respond: ${err.message}`;
  }
}

module.exports = { talkAs };
