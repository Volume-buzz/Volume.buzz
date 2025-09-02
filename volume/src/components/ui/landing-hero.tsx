'use client';

import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { BeamsBackground } from './beams-background';
import TextMarquee from './text-marque';

import Image from 'next/image';
import Link from 'next/link';

gsap.registerPlugin(SplitText, useGSAP);

// ===================== HERO =====================
interface HeroProps {
  title: string;
  description: string;
}

export default function Hero({
  title,
  description,
}: HeroProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLHeadingElement | null>(null);
  const paraRef = useRef<HTMLParagraphElement | null>(null);
  const ctaRef = useRef<HTMLDivElement | null>(null);
  const logoRef1 = useRef<HTMLDivElement | null>(null);
  const logoRef2 = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      if (!headerRef.current) return;

      document.fonts.ready.then(() => {
        const split = new SplitText(headerRef.current!, {
          type: 'lines',
          wordsClass: 'lines',
        });

        gsap.set(split.lines, {
          filter: 'blur(16px)',
          yPercent: 30,
          autoAlpha: 0,
          scale: 1.06,
          transformOrigin: '50% 100%',
        });

        if (paraRef.current) {
          gsap.set(paraRef.current, { autoAlpha: 0, y: 20 });
        }
        if (ctaRef.current) {
          gsap.set(ctaRef.current, { autoAlpha: 0, y: 20 });
        }

        // Animate floating logos
        if (logoRef1.current) {
          gsap.set(logoRef1.current, { autoAlpha: 0, scale: 0.5, rotation: -45 });
        }
        if (logoRef2.current) {
          gsap.set(logoRef2.current, { autoAlpha: 0, scale: 0.5, rotation: 45 });
        }

        const tl = gsap.timeline({
          defaults: { ease: 'power3.out' },
        });

        // Animate logos first
        if (logoRef1.current && logoRef2.current) {
          tl.to([logoRef1.current, logoRef2.current], { 
            autoAlpha: 0.1, 
            scale: 1, 
            rotation: 0, 
            duration: 1.2,
            stagger: 0.2 
          }, 0.0);
        }

        // Then text
        tl.to(
          split.lines,
          {
            filter: 'blur(0px)',
            yPercent: 0,
            autoAlpha: 1,
            scale: 1,
            duration: 1.2,
            stagger: 0.2,
          },
          0.3,
        );

        if (paraRef.current) {
          tl.to(paraRef.current, { autoAlpha: 1, y: 0, duration: 0.8 }, '-=0.6');
        }
        if (ctaRef.current) {
          tl.to(ctaRef.current, { autoAlpha: 1, y: 0, duration: 0.8 }, '-=0.4');
        }

        // Continuous floating animation for logos
        if (logoRef1.current) {
          gsap.to(logoRef1.current, {
            y: -20,
            rotation: 5,
            duration: 4,
            repeat: -1,
            yoyo: true,
            ease: 'power1.inOut',
            delay: 2
          });
        }

        if (logoRef2.current) {
          gsap.to(logoRef2.current, {
            y: 20,
            rotation: -5,
            duration: 5,
            repeat: -1,
            yoyo: true,
            ease: 'power1.inOut',
            delay: 2.5
          });
        }
      });
    },
    { scope: sectionRef },
  );

  return (
    <section ref={sectionRef} className="relative h-screen w-screen overflow-hidden">
      <BeamsBackground intensity="strong" className="absolute inset-0" />
      
      {/* Floating Discord Logo */}
      <div 
        ref={logoRef1}
        className="absolute top-20 left-10 w-32 h-32 opacity-10 pointer-events-none z-5"
      >
        <Image
          src="/icons/discord.svg"
          alt="Discord"
          width={128}
          height={128}
          className="w-full h-full object-contain filter brightness-200"
        />
      </div>

      {/* Floating Spotify Logo */}
      <div 
        ref={logoRef2}
        className="absolute top-32 right-16 w-28 h-28 opacity-10 pointer-events-none z-5"
      >
        <Image
          src="/icons/spotify.svg"
          alt="Spotify"
          width={112}
          height={112}
          className="w-full h-full object-contain filter brightness-200"
        />
      </div>

      {/* Marquee Text at Top */}
      <div className="absolute top-4 left-0 right-0 z-20 opacity-20">
        <TextMarquee baseVelocity={-0.4} clasname="font-outfit font-semibold text-white/70">
          SPOTIFY RAIDS • CRYPTO REWARDS • DISCORD AUTOMATION • VOLUME BOT •
        </TextMarquee>
      </div>

      {/* Main Content - Centered */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
        <div className="max-w-3xl mx-auto space-y-8">
          
          {/* Main Title with Gradient Fade */}
          <div className="relative">
            <h1 
              ref={headerRef} 
              className="text-6xl md:text-7xl lg:text-8xl font-outfit font-bold leading-[0.9] tracking-tight text-white bg-gradient-to-b from-white via-white to-transparent bg-clip-text text-transparent"
              style={{
                maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 100%)'
              }}
            >
              {title}
            </h1>
          </div>

          {/* Description */}
          <p 
            ref={paraRef} 
            className="text-lg md:text-xl font-outfit font-light leading-relaxed tracking-tight text-white/80 mx-auto"
          >
            {description}
          </p>

          {/* CTA Button */}
          <div ref={ctaRef} className="pt-4">
            <Link href="/login" className="inline-block">
              <span className="text-4xl font-inter font-bold text-white hover:text-white/80 transition-colors duration-200">
                Get Started
              </span>
            </Link>
          </div>

        </div>
      </div>

      {/* Marquee Text at Bottom */}
      <div className="absolute bottom-4 left-0 right-0 z-20 opacity-20">
        <TextMarquee baseVelocity={0.6} clasname="font-outfit font-semibold text-white/70">
          MUSIC CAMPAIGNS • EARN TOKENS • DISCORD COMMUNITY • SPOTIFY INTEGRATION •
        </TextMarquee>
      </div>

      {/* Bottom Gradient */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent" />
    </section>
  );
}