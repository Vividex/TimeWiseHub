import Image from 'next/image'
import type { IndustryContent } from '@/lib/landing-industries'

function ShowcaseCard({
  item,
  priority = false,
}: {
  item: IndustryContent['showcaseImages'][number]
  priority?: boolean
}) {
  return (
    <a
      href={item.image.src}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${item.label} product screenshot`}
      className="group w-[320px] shrink-0 overflow-hidden rounded-2xl border border-cyan-200/15 bg-slate-900/85 p-2 shadow-2xl shadow-slate-950/50 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-cyan-950/40 focus:outline-none focus:ring-2 focus:ring-cyan-300 sm:w-[520px]"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-bold text-white">{item.label}</span>
        <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
          Live view
        </span>
      </div>
      <Image
        src={item.image}
        alt={item.alt}
        priority={priority}
        sizes="(min-width: 640px) 520px, 320px"
        className="aspect-[16/10] w-full rounded-xl border border-white/10 object-cover"
      />
    </a>
  )
}

export default function FeatureCarousel({ industry }: { industry: IndustryContent }) {
  const marqueeItems = [...industry.showcaseImages, ...industry.showcaseImages]
  const firstShowcaseItem = industry.showcaseImages[0]

  return (
    <>
      <section id="features" className="bg-slate-950 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">Platform</p>
            <h2 className="mt-4 text-4xl font-black leading-tight text-white md:text-5xl">
              {industry.featuresHeading}
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-400">{industry.featuresSubheading}</p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {industry.featureCards.map((feature) => (
              <a
                href={feature.href}
                key={feature.title}
                className="landing-rise rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/35 hover:bg-cyan-300/[0.06] focus:outline-none focus:ring-2 focus:ring-cyan-300"
                aria-label={`View product showcase for ${feature.title}`}
              >
                <div className="mb-5 h-1.5 w-12 rounded-full bg-cyan-300 shadow-lg shadow-cyan-400/40" />
                <h3 className="text-lg font-bold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{feature.body}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section
        id="showcase"
        className="overflow-hidden border-y border-white/10 bg-[linear-gradient(180deg,#020617_0%,#07111f_52%,#020617_100%)] py-24"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1fr] lg:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">
                Product showcase
              </p>
              <h2 className="mt-4 text-4xl font-black leading-tight text-white md:text-5xl">
                {industry.showcaseHeading}
              </h2>
            </div>
            <p className="text-lg leading-8 text-slate-400">{industry.showcaseSubheading}</p>
          </div>

          <div className="mt-12 overflow-hidden rounded-[1.75rem] border border-cyan-200/15 bg-slate-900/80 p-2 shadow-2xl shadow-cyan-950/30">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-bold text-white">{firstShowcaseItem.label}</span>
              <a
                href={firstShowcaseItem.image.src}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/20 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                Command centre
              </a>
            </div>
            <a
              href={firstShowcaseItem.image.src}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${firstShowcaseItem.label} product screenshot`}
              className="block focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              <Image
                src={firstShowcaseItem.image}
                alt={firstShowcaseItem.alt}
                priority
                sizes="(min-width: 1280px) 1216px, 100vw"
                className="h-auto w-full rounded-2xl border border-white/10 object-cover"
              />
            </a>
          </div>
        </div>

        <div className="landing-marquee mt-12">
          <div className="landing-marquee-track flex gap-5">
            {marqueeItems.map((item, index) => (
              <ShowcaseCard item={item} key={`${item.label}-${index}`} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
