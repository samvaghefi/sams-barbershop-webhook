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

// Extract booking info from Vapi's webhook data
function extractBookingInfo(vapiData) {
  const message = vapiData.message || vapiData;
  const transcript = message.transcript || message.artifact?.transcript || '';
  const summary = message.summary || message.analysis?.summary || '';
  const customer = message.customer || {};
  
  const customerPhone = customer.number;
  
  console.log('Summary:', summary);
  console.log('Transcript preview:', transcript.substring(0, 200));
  
  // Extract name from summary - it's usually at the start
  let name = null;
  
  // Pattern 1: "Name called to book" - most reliable from summary
  const summaryNameMatch = summary.match(/^([A-Z][a-z]+)\s+called/);
  if (summaryNameMatch && summaryNameMatch[1].toLowerCase() !== 'customer') {
    name = summaryNameMatch[1];
  }
  
  // Pattern 2: Look in transcript for explicit name statements
  if (!name) {
    const transcriptPatterns = [
      /(?:my name is|I'm|call me|this is)\s+([A-Za-z]+)/i,
      /name'?s?\s+([A-Za-z]+)/i
    ];
    
    for (const pattern of transcriptPatterns) {
      const match = transcript.match(pattern);
      if (match && match[1] && 
          match[1].toLowerCase() !== 'sarah' && 
          match[1].toLowerCase() !== 'barbershop') {
        name = match[1];
        break;
      }
    }
  }
  
  // Extract service - handle multiple services
  let service = 'appointment';
  
  // Check for service changes first
  if (/changed.*(?:to|request)\s+(?:a\s+)?beard\s*trim/i.test(summary)) {
    service = 'beard trim';
  } else if (/changed.*(?:to|request)\s+(?:a\s+)?(?:men's\s+)?haircut/i.test(summary)) {
    service = "men's haircut";
  } else {
    // Look for multiple services
    const hasMensHaircut = /men'?s?\s+haircut/i.test(summary);
    const hasKidsHaircut = /kid'?s?\s+haircut|child'?s?\s+haircut|haircut\s+for\s+(?:his|her)\s+(?:son|daughter|child)/i.test(summary);
    const hasBeardTrim = /beard\s*trim/i.test(summary);
    
    const services = [];
    if (hasMensHaircut) services.push("men's haircut");
    if (hasKidsHaircut) services.push("kid's haircut");
    if (hasBeardTrim) services.push('beard trim');
    
    if (services.length > 0) {
      service = services.join(' and ');
    }
  }
  
  // Extract date
  const dateMatch = summary.match(/(?:Thursday|Friday|Saturday|Sunday|Monday|Tuesday|Wednesday),?\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i);
  const date = dateMatch ? dateMatch[0] : null;
  
  // Extract time
  const timeMatch = summary.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
  const time = timeMatch ? timeMatch[1] : null;
  
  // Extract special requests
  const fullText = summary + ' ' + transcript;
  const specialMatches = fullText.match(/(?:low fade|high fade|skin fade|taper|buzz cut|faded beard)/gi);
  const specialRequests = specialMatches ? [...new Set(specialMatches.map(s => s.toLowerCase()))].join(', ') : null;
  
  return {
    name: name,
    customerPhone: customerPhone,
    service: service,
    date: date,
    time: time,
    specialRequests: specialRequests
  };
}

// Send SMS to customer
async function sendCustomerSMS(booking) {
  const message = `Thanks for booking with Sam's Barbershop! Your ${booking.service || 'appointment'} is on ${booking.date} at ${booking.time}. We'll see you at 200 Goulding Ave, North York. Reply CANCEL to cancel.`;
  
  await twilioClient.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: booking.customerPhone
  });
  
  console.log('SMS sent to customer:', booking.customerPhone);
}

// Send email to owner
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
    from: process.env.OWNER_EMAIL,
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