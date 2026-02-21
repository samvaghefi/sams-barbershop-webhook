const express = require('express');
const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');

// SendGrid setup
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const app = express();
app.use(express.json());

// Twilio setup
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);


// Webhook endpoint that Vapi will call
app.post('/booking-webhook', async (req, res) => {
  try {
    console.log('Received booking data:', req.body);
    
    // Extract booking details from Vapi
    const bookingData = extractBookingInfo(req.body);
    
    // VALIDATE: Only send confirmation if we have ALL required data
    if (!bookingData.customerPhone || !bookingData.name || !bookingData.date || !bookingData.time) {
      console.log('Incomplete booking data - skipping confirmation:', bookingData);
      return res.status(200).send('OK - Incomplete data');
    }
    
    console.log('Complete booking data:', bookingData);
    
    // Send SMS to customer
    await sendCustomerSMS(bookingData);
    
    // Send email to you
    await sendOwnerEmail(bookingData);
    
    res.status(200).send('Booking processed successfully');
    
  } catch (error) {
    console.error('Error processing booking:', error);
    res.status(500).send('Error processing booking');
  }
});

//Extract Booking Info
function extractBookingInfo(vapiData) {
  // Vapi sends the data in the 'message' object
  const message = vapiData.message || vapiData;
  const transcript = message.transcript || message.artifact?.transcript || '';
  const summary = message.summary || message.analysis?.summary || '';
  const customer = message.customer || {};
  
  // Extract customer phone from the customer object
  const customerPhone = customer.number;
  
  // Use AI summary to extract details, or parse from transcript
  const fullText = summary + ' ' + transcript;
  
  // Extract name - look for more patterns
  let name = null;
  const namePatterns = [
    /(?:name is|I'm|call me|this is)\s+([A-Za-z]+)/i,
    /my name'?s?\s+([A-Za-z]+)/i,
    /([A-Z][a-z]+)\s+(?:called|booking)/i
  ];
  
  for (const pattern of namePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1] && match[1].toLowerCase() !== 'sam') {
      name = match[1];
      break;
    }
  }
  
  // Extract service - be more specific
  let service = 'appointment';
  const lowerText = fullText.toLowerCase();
  
  // Check for explicit "beard trim" or "beard shave" mentions
  const hasBearTrim = /beard\s*(?:trim|shave|shaving)/i.test(fullText);
  const hasHaircut = /haircut|cut\s+(?:my\s+)?hair/i.test(fullText);
  
  if (hasHaircut && hasBearTrim) {
    service = "men's haircut and beard trim";
  } else if (hasHaircut) {
    service = "men's haircut";
  } else if (hasBearTrim) {
    service = 'beard trim';
  }
  
  // Extract date - look for date patterns
  const dateMatch = fullText.match(/(?:Thursday|Friday|Saturday|Sunday|Monday|Tuesday|Wednesday),?\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i);
  const date = dateMatch ? dateMatch[0] : null;
  
  // Extract time - look for time patterns
  const timeMatch = fullText.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
  const time = timeMatch ? timeMatch[1] : null;
  
  // Extract special requests
  const specialMatch = fullText.match(/(?:low fade|high fade|skin fade|taper|buzz cut|faded beard)/gi);
  const specialRequests = specialMatch ? specialMatch.join(', ') : null;
  
  return {
    name: name,
    customerPhone: customerPhone,
    service: service,
    date: date,
    time: time,
    specialRequests: specialRequests
  };
}

// Helper function to extract information
function extractField(text, field) {
  // Simple extraction - we'll improve this based on testing
  // For now, returns null if not found
  return null;
}

// Send SMS to customer
async function sendCustomerSMS(booking) {
  const message = `Thanks for booking with Sam's Barbershop! Your ${booking.service || 'appointment'} is on ${booking.date} at ${booking.time}. We'll see you at 200 Goulding Ave, North York. Reply CANCEL to cancel.`;
  
  await twilioClient.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,  // Your Toronto number
    to: booking.customerPhone
  });
  
  console.log('SMS sent to customer:', booking.customerPhone);
}

// Send email to owner (you)
async function sendOwnerEmail(booking) {
  const emailBody = `
New Booking at Sam's Barbershop!

Customer: ${booking.name}
Phone: ${booking.customerPhone}
Service: ${booking.service}
Date: ${booking.date}
Time: ${booking.time}
Special Requests: ${booking.specialRequests || 'None'}

Please add this to your calendar.
  `;
  
  const msg = {
    to: process.env.OWNER_EMAIL,
    from: process.env.OWNER_EMAIL, // SendGrid requires verified sender
    subject: `New Booking: ${booking.name} - ${booking.date}`,
    text: emailBody,
  };
  
  await sgMail.send(msg);
  console.log('Email sent to owner');
}

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Sam\'s Barbershop Booking Webhook is running!');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});