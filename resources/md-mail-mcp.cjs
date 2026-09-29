#!/usr/bin/env node
'use strict';

/**
 * md-mail: the mail tools a team member uses (docs/designs/multi-mailbox.md, E1).
 *
 * A dependency-free MCP stdio server. Claude Code starts it outside the agent's
 * Bash sandbox (sandboxed Bash cannot reach the broker; an MCP server can), with
 * MD_BROKER_URL and MD_BROKER_TOKEN in its environment. Every tool call becomes
 * `POST <broker>/mail/<tool>`; the broker decides what this agent may do, so
 * this file holds no passwords and no rules.
 *
 * The stdio loop (JSON-RPC, broker calls, error handling) is shared with the
 * other helpers in md-mcp-core.cjs (eng review EXT-1); this file is only the
 * mail tools.
 */

const { serve } = require('./md-mcp-core.cjs');

const mailbox = { type: 'string', description: 'Mailbox id from list_mailboxes, for example "sales-example-com".' };
const ref = {
  type: 'object',
  description: 'A message in a mailbox: {mailbox, id} where id comes from search.',
  properties: { mailbox: { type: 'string' }, id: { type: 'string' } },
  required: ['mailbox', 'id']
};
const compose = {
  mailbox,
  to: { type: 'string', description: 'Recipients, comma separated.' },
  cc: { type: 'string' },
  subject: { type: 'string' },
  body: { type: 'string', description: 'Plain text body.' },
  reply_to: { ...ref, description: 'The message you are replying to (threads the reply).' },
  forward: { ...ref, description: 'A message to forward, from this same mailbox.' },
  attach_from: { type: 'array', items: ref, description: 'Messages whose attachments to include, from this same mailbox.' }
};

const TOOLS = [
  {
    name: 'list_mailboxes',
    description: 'The mailbox the owner has given you (at most one), and whether you can send or only draft. Call this first.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'search',
    description: 'Find messages in one of your mailboxes (newest first, 20 per page by default, 50 at most).',
    inputSchema: {
      type: 'object',
      properties: {
        mailbox,
        text: { type: 'string', description: 'Words anywhere in the message.' },
        from: { type: 'string' },
        subject: { type: 'string' },
        since: { type: 'string', description: 'A date, for example 2026-09-01.' },
        unread: { type: 'boolean' },
        limit: { type: 'number', description: 'How many messages per page: 20 if left out, at most 50.' },
        page: { type: 'number', description: 'Which page, counting from 0 (0 is the newest messages).' }
      },
      required: ['mailbox']
    }
  },
  {
    name: 'read',
    description: 'Read one message (text, sender, recipients, attachment names).',
    inputSchema: { type: 'object', properties: { mailbox, id: { type: 'string', description: 'Message id from search.' } }, required: ['mailbox', 'id'] }
  },
  {
    name: 'draft',
    description: "Save a reply or new message in the mailbox's Drafts folder for the owner to review and send.",
    inputSchema: { type: 'object', properties: compose, required: ['mailbox', 'to', 'subject', 'body'] }
  },
  {
    name: 'send',
    description: 'Send a message from one of your mailboxes. Only works if the owner set you to Can send; otherwise use draft.',
    inputSchema: { type: 'object', properties: compose, required: ['mailbox', 'to', 'subject', 'body'] }
  }
];

serve({
  name: 'md-mail',
  route: 'mail',
  instructions: 'Mail tools for the mailboxes the owner gave you. Call list_mailboxes first.',
  tools: TOOLS,
  notConnected: 'Mail is not connected for you right now.',
  errorLabel: 'Mail'
});
