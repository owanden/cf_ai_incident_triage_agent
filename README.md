# Incident Triage Agent (Cloudflare Workers AI)

An AI-powered incident debugging assistant built on Cloudflare.

The agent analyzes logs and system errors to generate:

- incident summaries
- likely root causes
- debugging steps
- follow-up questions

## Architecture

Browser Chat UI -->
Cloudflare Worker -->
Workers AI (Llama) -->
Durable Object (incident memory)

## Features

- persistent incident sessions
- structured AI responses
- incident overview panel
- status toggling (open / resolved)

## Run locally

npm install  
npm run dev

## Example prompt
500 errors spiked right after deployment and logs show repeated timeout errors from the payment service.
