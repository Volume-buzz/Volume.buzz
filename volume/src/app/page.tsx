import Hero from "@/components/ui/neural-network-hero";

export default function Home() {
  return (
    <main>
      <Hero
        title="Command your server like never before"
        description="Volume brings next-generation Discord bot capabilities to your community. Advanced moderation, seamless music streaming, and intelligent automation — all in one powerful package."
        badgeText="Volume Bot Dashboard"
        badgeLabel="Live"
        ctaButtons={[
          { text: "Add to Discord", href: "/login", primary: true },
          { text: "Explore features", href: "#features" }
        ]}
        microDetails={["Advanced Moderation", "High‑Quality Music", "Smart Automation"]}
      />
    </main>
  );
}
