/**
 * Verification of the API-contract layer against the JSON bodies published in
 * the GREEN-API docs. Run with `npm test`.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { toInboundTextMessage } from '@/api/normalizeNotification'
import {
  chatIdToPhone,
  formatPhone,
  isValidPhone,
  normalizePhone,
  toChatId,
} from '@/utils/format'

/* -------------------------------------------------------------------------- */
/* normalizeNotification — exact bodies copied from the GREEN-API docs        */
/* -------------------------------------------------------------------------- */

test('incoming text message is converted to a displayable message', () => {
  const body = {
    typeWebhook: 'incomingMessageReceived',
    instanceData: {
      idInstance: 7103000000,
      wid: '79876543210@c.us',
      typeInstance: 'whatsapp',
    },
    timestamp: 1588091580,
    idMessage: 'F7AEC1B7086ECDC7E6E45923F5EDB825',
    senderData: {
      chatId: '79001234567@c.us',
      sender: '79001234567@c.us',
      chatName: 'John',
      senderName: 'John',
      senderContactName: 'John Doe',
    },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: {
        textMessage: 'I use Green-API to send this message to you!',
      },
    },
  }

  const message = toInboundTextMessage(body)
  assert.ok(message, 'expected a message')
  assert.equal(message.idMessage, 'F7AEC1B7086ECDC7E6E45923F5EDB825')
  assert.equal(message.chatId, '79001234567@c.us')
  assert.equal(message.text, 'I use Green-API to send this message to you!')
  assert.equal(message.timestamp, 1588091580)
  assert.equal(message.senderName, 'John')
  assert.equal(message.direction, 'incoming')
})

test('incoming messages with no text are ignored', () => {
  const base = {
    typeWebhook: 'incomingMessageReceived',
    timestamp: 1588091580,
    idMessage: 'A1',
    senderData: { chatId: '79001234567@c.us', sender: '79001234567@c.us' },
  }

  // Non-text message types have no textMessageData at all.
  for (const typeMessage of [
    'imageMessage',
    'videoMessage',
    'documentMessage',
    'audioMessage',
    'stickerMessage',
    'pollMessage',
    'reactionMessage',
    'locationMessage',
    'contactMessage',
    'editedMessage',
    'deletedMessage',
  ]) {
    assert.equal(
      toInboundTextMessage({ ...base, messageData: { typeMessage } }),
      null,
      `${typeMessage} must be ignored`,
    )
  }

  // Present but empty text must not produce an empty bubble.
  assert.equal(
    toInboundTextMessage({
      ...base,
      messageData: {
        typeMessage: 'textMessage',
        textMessageData: { textMessage: '' },
      },
    }),
    null,
  )

  // Messages without a chatId cannot be placed in a conversation.
  assert.equal(
    toInboundTextMessage({
      ...base,
      senderData: {},
      messageData: {
        typeMessage: 'textMessage',
        textMessageData: { textMessage: 'hi' },
      },
    }),
    null,
  )
})

test('extended text (link preview / quote) is still displayable', () => {
  const message = toInboundTextMessage({
    typeWebhook: 'incomingMessageReceived',
    timestamp: 1588091580,
    idMessage: 'B2',
    senderData: { chatId: '79001234567@c.us', sender: '79001234567@c.us' },
    messageData: {
      typeMessage: 'extendedTextMessage',
      extendedTextMessageData: { textMessage: 'https://example.com текст' },
    },
  })

  assert.ok(message)
  assert.equal(message.text, 'https://example.com текст')
})

test('message sent from the phone is marked as outgoing', () => {
  const message = toInboundTextMessage({
    typeWebhook: 'outgoingMessageReceived',
    timestamp: 1588091580,
    idMessage: 'C3',
    senderData: {
      chatId: '79001234567@c.us',
      sender: '79876543210@c.us',
      senderName: 'John',
    },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: { textMessage: 'sent from the phone' },
    },
  })

  assert.ok(message)
  assert.equal(message.direction, 'outgoing')
  assert.equal(message.sender, '79876543210@c.us')
})

test('outgoingAPIMessageReceived is not rendered (dedup safety)', () => {
  const message = toInboundTextMessage({
    typeWebhook: 'outgoingAPIMessageReceived',
    timestamp: 1588091580,
    idMessage: 'D4',
    senderData: { chatId: '79001234567@c.us', sender: '79876543210@c.us' },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: { textMessage: 'echo of our own send' },
    },
  })

  assert.equal(message, null)
})

test('non-message notifications are ignored', () => {
  for (const typeWebhook of [
    'outgoingMessageStatus',
    'stateInstanceChanged',
    'statusInstanceChanged',
    'deviceInfo',
    'incomingCall',
    'outgoingCall',
    'incomingBlock',
    'quotaExceeded',
  ]) {
    assert.equal(
      toInboundTextMessage({ typeWebhook, timestamp: 1 } as never),
      null,
      `${typeWebhook} must be ignored`,
    )
  }
})

/* -------------------------------------------------------------------------- */
/* Phone number handling                                                      */
/* -------------------------------------------------------------------------- */

test('phone numbers are normalised to a GREEN-API chat id', () => {
  const expected = '79991234567@c.us'

  for (const input of [
    '+7 999 123-45-67',
    '8 999 123 45 67',
    '89991234567',
    '9991234567',
    '7 (999) 123-45-67',
    '79991234567@c.us',
    '  +79991234567  ',
  ]) {
    assert.equal(toChatId(input), expected, `input: ${input}`)
  }

  assert.equal(normalizePhone('9991234567'), '79991234567')
  assert.equal(chatIdToPhone('79991234567@c.us'), '79991234567')
})

test('invalid numbers are rejected', () => {
  assert.equal(isValidPhone('123'), false)
  assert.equal(isValidPhone(''), false)
  assert.equal(isValidPhone('99912345'), false)
  assert.equal(isValidPhone('+7 999 123-45-67'), true)
})

test('display formatting keeps unknown lengths readable', () => {
  assert.equal(formatPhone('79991234567'), '+7 999 123-45-67')
  assert.equal(formatPhone('89991234567'), '+7 999 123-45-67')
  assert.equal(formatPhone(''), '')

  // Unknown country code: grouped in threes, but no digit may be lost —
  // `formatPhone` is display-only, `toChatId` handles the wire format.
  assert.equal(formatPhone('442071234567').replace(/\D/g, ''), '442071234567')
  assert.equal(formatPhone('442071234567').startsWith('+442'), true)
})
