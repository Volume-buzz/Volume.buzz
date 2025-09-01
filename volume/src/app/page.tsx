import Hero from "@/components/ui/neural-network-hero";

export default function Home() {
  return (
    <main>
      <Hero
        title="Volume Discord Bot"
        description="Take control of your Discord server with advanced moderation, music, and utility features. Built for communities that demand more."
        badgeText="Volume Bot Dashboard"
        badgeLabel="Live"
        ctaButtons={[
          { text: "Get started", href: "/login", primary: true },
          { text: "View features", href: "#features" }
        ]}
        microDetails={["Discord Integration", "Real‑time Analytics", "Advanced Controls"]}
      />
    </main>
  );
}
