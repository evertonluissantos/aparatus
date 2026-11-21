import { receiveLegacyStripeEvent } from "@/lib/legacy-stripe/process-event";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const POST = async (request: Request) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }
  const text = await request.text();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(text, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    const status = await receiveLegacyStripeEvent(event, stripe);
    return NextResponse.json({ received: true, status });
  } catch {
    // No payload, provider errors or credentials in logs/responses. Retry is safe.
    return NextResponse.json({ error: "Processing pending" }, { status: 503 });
  }
};
