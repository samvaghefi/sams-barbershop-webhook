// Import the correct class
const { VapiClient } = require('@vapi-ai/server-sdk');

// Create a new Vapi client with your API key
const vapi = new VapiClient({
  token: '0d7c74ed-3ee8-46d0-8b00-e405f6593104'
});

// Test function to check if connection works
async function testConnection() {
  try {
    console.log('Testing connection to Vapi...');
    
    // Try to list your assistants
    const assistants = await vapi.assistants.list();
    
    console.log('✅ Connection successful!');
    console.log('Number of assistants:', assistants.length);
    
  } catch (error) {
    console.log('❌ Connection failed');
    console.log('Error:', error.message);
  }
}

// Run the test
testConnection();