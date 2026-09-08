import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local webhook testing (Telegram / WhatsApp-Twilio) is done through an ngrok tunnel;
  // allow its dev resources so HMR works and Next doesn't warn on every request.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
};

export default nextConfig;
