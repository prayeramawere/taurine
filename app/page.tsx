"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Property = {
  property_id: string;
  property_type: string;
  location?: string | null;
  listing_price: number;
  listing_status: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_footage?: number | null;
  description?: string | null;
  features?: string[] | null;
  property_media?: Array<{ media_url: string; media_type: string; is_primary?: boolean }>;
};
type ChatProperty = { property_id: string; property_type: string; location?: string | null; listing_price?: number; bedrooms?: number | null; bathrooms?: number | null };
type ChatMessage = { role: "user" | "assistant"; content: string; properties?: ChatProperty[] };
type ApiResult<T> = { success: boolean; data?: T; error?: { message?: string } };

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function PropertyCard({ property }: { property: Property }) {
  const image = property.property_media?.find((item) => item.is_primary)?.media_url ?? property.property_media?.[0]?.media_url;
  return (
    <article className="property-card">
      <Link className="property-photo" href={`/property/${property.property_id}`} aria-label={`View ${property.property_type} in ${property.location ?? "available location"}`}>
        {image ? <img src={image} alt={`${property.property_type} in ${property.location ?? "available location"}`} /> : <span className="photo-placeholder">TAURINE <i>PROPERTY COLLECTION</i></span>}
        <span className="status-pill">{property.listing_status}</span>
      </Link>
      <div className="property-card-content">
        <div className="property-card-top"><span>{property.property_type}</span><span>{money(property.listing_price)}</span></div>
        <h3>{property.location || "Location available on request"}</h3>
        <p>{property.bedrooms ?? "—"} beds <b>·</b> {property.bathrooms ?? "—"} baths <b>·</b> {property.square_footage ? `${Number(property.square_footage).toLocaleString()} sq ft` : "Size on request"}</p>
        <Link className="text-link" href={`/property/${property.property_id}`}>Explore property <span aria-hidden="true">↗</span></Link>
      </div>
    </article>
  );
}

export default function HomePage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("newest");
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hello, I’m Taurine’s property consultant. Tell me what you’re looking for, or ask me about a specific listing." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/properties", { cache: "no-store" });
      const result = await response.json() as ApiResult<Property[]>;
      if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error(result.error?.message ?? "Listings could not be loaded.");
      setProperties(result.data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Listings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchProperties(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchProperties]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.location.hash === "#assistant") setChatOpen(true);
      const propertyId = new URLSearchParams(window.location.search).get("propertyId");
      if (propertyId) {
        setChatOpen(true);
        setChatInput(`Please tell me about this property: ${propertyId}`);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    const list = properties.filter((item) =>
      item.listing_status.toLowerCase() === "active" &&
      (!location || (item.location ?? "").toLowerCase().includes(location.toLowerCase())) &&
      (type === "all" || item.property_type.toLowerCase() === type.toLowerCase()) &&
      (!maxPrice || item.listing_price <= Number(maxPrice)),
    );
    if (sort === "price-asc") list.sort((a, b) => a.listing_price - b.listing_price);
    else if (sort === "price-desc") list.sort((a, b) => b.listing_price - a.listing_price);
    return list;
  }, [properties, location, type, maxPrice, sort]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    setChatError("");
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setChatLoading(true);
    try {
      const token = window.sessionStorage.getItem("taurine-chat-session");
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, ...(token ? { sessionToken: token } : {}) }),
      });
      const result = await response.json() as ApiResult<{ message: string; sessionToken: string; properties?: ChatProperty[] }>;
      if (!response.ok || !result.success || !result.data) throw new Error(result.error?.message ?? "The assistant is unavailable.");
      window.sessionStorage.setItem("taurine-chat-session", result.data.sessionToken);
      setMessages([...nextMessages, { role: "assistant", content: result.data.message, properties: result.data.properties }]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setChatLoading(false);
    }
  }

  const propertyTypes = Array.from(new Set(properties.map((item) => item.property_type).filter(Boolean)));

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Taurine home"><span className="brand-mark">T</span><span>TAURINE<small>REAL ESTATE</small></span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#properties">Properties</a><a href="#approach">Our approach</a><a href="#contact">Contact</a>
        </nav>
        <div className="header-actions"><a className="quiet-link" href="#contact">Speak to an advisor</a><Link className="button button-dark button-small" href="/staff">Staff sign in <span aria-hidden="true">↗</span></Link></div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> REAL ESTATE, CONSIDERED</p>
          <h1>Find a place<br />to <em>belong.</em></h1>
          <p className="hero-description">A more thoughtful way to find your next home. Explore considered properties, with a real person ready when you need one.</p>
          <a href="#properties" className="button button-light">Explore properties <span aria-hidden="true">↓</span></a>
          <div className="hero-note"><span className="hero-note-mark">✳</span><span>Thoughtful guidance.<br />Homes with meaning.</span></div>
        </div>
        <div className="hero-visual" role="img" aria-label="Warm modern home interior">
          <div className="visual-overlay" />
          <div className="hero-caption"><span>01 / A PLACE TO CALL YOURS</span><span>DISCOVER WITH TAURINE ↗</span></div>
        </div>
      </section>

      <section className="intro-strip" id="approach">
        <p>More than a search.<br /><em>A beginning.</em></p>
        <div><span className="eyebrow">A DIFFERENT PERSPECTIVE</span><p>Finding the right property isn’t just about the numbers. It’s about the life you imagine there. We bring local insight, thoughtful advice, and care to every step.</p></div>
        <button className="round-arrow" aria-label="Talk to our property consultant" onClick={() => setChatOpen(true)}>↗</button>
      </section>

      <section className="listings-section" id="properties">
        <div className="section-heading">
          <div><span className="eyebrow">THE COLLECTION</span><h2>Places worth<br /><em>coming home to.</em></h2></div>
          <p>Discover the homes and spaces currently available through Taurine. Each listing is drawn from our live property database.</p>
        </div>
        <div className="filter-bar" role="search" aria-label="Filter properties">
          <label>LOCATION<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City or neighborhood" /></label>
          <label>PROPERTY TYPE<select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option>{propertyTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>MAXIMUM PRICE<input type="number" min="0" inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="No limit" /></label>
          <label>SORT BY<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Recently added</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label>
        </div>
        {loading ? <div className="loading-state"><span className="spinner" /> Loading live listings…</div> :
          loadError ? <div className="empty-state"><h3>We couldn’t load the listings.</h3><p>{loadError}</p><button className="button button-dark button-small" onClick={() => void fetchProperties()}>Try again</button></div> :
            filtered.length ? <div className="property-grid">{filtered.map((property) => <PropertyCard key={property.property_id} property={property} />)}</div> :
              <div className="empty-state"><h3>No properties match those filters.</h3><p>Try another location or price range, or ask our consultant to help find a match.</p><button className="text-link button-plain" onClick={() => { setLocation(""); setType("all"); setMaxPrice(""); }}>Clear filters ↗</button></div>}
      </section>

      <section className="cta-band" id="contact"><div><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h2>Not sure where<br />to begin?</h2><p>Tell us what matters most. Our property consultant can help you explore live listings or save your preferences for future matches.</p></div><button className="button button-light" onClick={() => setChatOpen(true)}>Talk to our consultant <span aria-hidden="true">↗</span></button></section>
      <footer className="site-footer"><Link className="brand brand-light" href="/"><span className="brand-mark">T</span><span>TAURINE<small>REAL ESTATE</small></span></Link><p>Thoughtful guidance. Homes with meaning.</p><span>© {new Date().getFullYear()} Taurine Real Estate</span></footer>

      <button id="assistant" className="chat-launcher" aria-label={chatOpen ? "Close property consultant" : "Open property consultant"} onClick={() => setChatOpen(!chatOpen)}>{chatOpen ? "×" : <><span className="chat-spark">✳</span><span>PROPERTY<br />CONSULTANT</span><b>↗</b></>}</button>
      {chatOpen && <aside className="chat-panel" aria-label="Property consultant chat">
        <div className="chat-heading"><div><span className="chat-spark">✳</span><div><strong>Property consultant</strong><small>Ask about live listings</small></div></div><button aria-label="Close chat" onClick={() => setChatOpen(false)}>×</button></div>
        <div className="chat-messages" aria-live="polite">{messages.map((message, index) => <div className={`chat-bubble ${message.role}`} key={`${index}-${message.role}`}><span>{message.content}</span>{message.properties?.map((property) => <Link className="chat-property" key={property.property_id} href={`/property/${property.property_id}`}><strong>{property.property_type}</strong><span>{property.location || "Location available"}</span><b>{typeof property.listing_price === "number" ? money(property.listing_price) : "View listing"} ↗</b></Link>)}</div>)}{chatLoading && <div className="chat-bubble assistant"><span className="typing">Taurine is thinking…</span></div>}</div>
        {chatError && <p className="form-error chat-error" role="alert">{chatError}</p>}
        <form className="chat-compose" onSubmit={sendMessage}><label className="sr-only" htmlFor="chat-message">Your message</label><input id="chat-message" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Tell us what you're looking for…" maxLength={3000} disabled={chatLoading} /><button type="submit" disabled={chatLoading || !chatInput.trim()} aria-label="Send message">↑</button></form>
        <p className="chat-privacy">For follow-up, the assistant will ask you to provide contact details and consent.</p>
      </aside>}
    </main>
  );
}
