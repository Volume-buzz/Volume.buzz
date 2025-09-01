import Hero from "@/components/ui/neural-network-hero";

export default function Home() {
  return (
    <Hero 
      title="Turn your music into crypto rewards"
      description="Connect your Spotify account to our Discord bot, participate in music raids, and earn real cryptocurrency rewards for listening to tracks."
      badgeText="Crypto Rewards System"
      badgeLabel="New"
      ctaButtons={[
        { text: "Get Started", href: "/signin", primary: true },
        { text: "Learn More", href: "#features" }
      ]}
      microDetails={["Real-time tracking", "Solana blockchain", "Premium support"]}
    />
  );
}
