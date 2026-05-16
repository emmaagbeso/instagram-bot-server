const express = require('express');
const app = express();
app.use(express.json());

const CLIENTS = {
  "1021390397733796": {
    name: "Client Name",
    platform: "whatsapp",
    phone_number_id: "1021390397733796",
    flowise_url: process.env.FLOWISE_URL,
    chatflow_id: process.env.CHATFLOW_ID,
    session_prefix: "client_whatsapp_",
    access_token: process.env.WHATSAPP_ACCESS_TOKEN
  },
  "17841464199929969": {
    name: "Chicken Republic",
    platform: "instagram",
    flowise_url: process.env.FLOWISE_URL,
    chatflow_id: process.env.CHATFLOW_ID,
    session_prefix: "chicken_republic_",
    access_token: process.env.INSTAGRAM_ACCESS_TOKEN
  }
};
console.log('ENV CHECK:', {
  flowise_url: process.env.FLOWISE_URL,
  chatflow_id: process.env.CHATFLOW_ID,
  whatsapp_token: process.env.WHATSAPP_ACCESS_TOKEN ? 'SET' : 'MISSING'
});
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret_verify_token";

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  res.sendStatus(200);

  // Instagram
  if (body.object === 'instagram') {
    for (const entry of body.entry || []) {
      const pageId = entry.id;
      const client = CLIENTS[pageId];
      if (!client) continue;
      const messaging = entry.messaging?.[0];
      if (!messaging || !messaging.message || messaging.message.is_echo) continue;
      const senderId = messaging.sender.id;
      const userMessage = messaging.message.text;
      if (!userMessage) continue;
      try {
        const botReply = await callFlowise(client, userMessage, senderId);
        await sendInstagramReply(client, senderId, botReply);
      } catch (err) {
        console.error(`Instagram Error:`, err.message);
      }
    }
  }

  // WhatsApp
  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry || []) {
      const changes = entry.changes?.[0];
      const phoneNumberId = changes?.value?.metadata?.phone_number_id;
      const client = CLIENTS[phoneNumberId];
      if (!client) continue;
      const message = changes?.value?.messages?.[0];
      if (!message || message.type !== 'text') continue;
      const senderId = message.from;
      const userMessage = message.text.body;
      try {
        const botReply = await callFlowise(client, userMessage, senderId);
        await sendWhatsAppReply(client, senderId, botReply);
      } catch (err) {
        console.error(`WhatsApp Error:`, err.message);
      }
    }
  }
});

async function sendWhatsAppReply(client, recipientId, message) {
  await fetch(`https://graph.facebook.com/v19.0/${client.phone_number_id}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${client.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipientId,
      text: { body: message }
    })
  });
}

async function sendInstagramReply(client, recipientId, message) {
  await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${client.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message }
    })
  });
}

async function callFlowise(client, message, userId) { 
  console.log('Calling Flowise with sessionId:', client.session_prefix + userId);
  const response = await fetch(`${client.flowise_url}/api/v1/prediction/${client.chatflow_id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: message,
      sessionId: client.session_prefix + userId
    })
  });
  const data = await response.json();
  return data.text || "Sorry, I could not process that.";
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot server running on port ${PORT}`));
