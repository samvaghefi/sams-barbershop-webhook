const express = require('express');
const twilio = require('twilio');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());

// Twilio setup
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Email setup (we'll use Gmail)
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,      // Your Gmail address
    pass: process.env.GMAIL_PASSWORD           // Gmail app password (not your regular password)
  }
});

// Webhook endpoint that Vapi will call
app.post('/booking-webhook', async (req, res) => {
  try {
    console.log('Received booking data:', req.body);
    
    // Extract booking details from Vapi
    const bookingData = extractBookingInfo(req.body);
    
    if (!bookingData.customerPhone || !bookingData.name) {
      console.log('Missing required booking data');
      return res.status(200).send('OK');
    }
    
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
  // Vapi sends the conversation transcript
  const transcript = vapiData.transcript || '';
  const messages = vapiData.messages || [];
  
  // Parse the booking details from the conversation
  // This is a simplified version - we'll refine it based on actual data
  return {
    name: extractField(transcript, 'name'),
    customerPhone: extractField(transcript, 'phone'),
    service: extractField(transcript, 'service'),
    date: extractField(transcript, 'date'),
    time: extractField(transcript, 'time'),
    specialRequests: extractField(transcript, 'special')
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
  
 await emailTransporter.sendMail({
  from: process.env.GMAIL_USER,
  to: process.env.GMAIL_USER,
  subject: `New Booking: ${booking.name} - ${booking.date}`,
  text: emailBody
});
  
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