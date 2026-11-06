"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type Property = {
  property_id: string;
  property_type: string;
  location?: string | null;
  listing_price: number;
  listing_status: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_footage?: number | null;
  lot_size?: number | null;
  year_built?: number | null;
  description?: string | null;
  features?: string[] | null;
  virtual_tour_url?: string | null;
};
type Media = { media_url: string; media_type: string; display_order?: number; is_primary?: boolean };
type ApiResult<T> = { success: boolean; data?: T; error?: { message?: string } };

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
}

export default function PropertyDetail({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeImage, setActiveImage] = useState(0);
  const [showEnquiry, setShowEnquiry] = useState(false);
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [propertyResponse, mediaResponse] = await Promise.all([
          fetch(`/api/properties/${encodeURIComponent(propertyId)}`, { cache: "no-store" }),
          fetch(`/api/properties/${encodeURIComponent(propertyId)}/media`, { cache: "no-store" }),
        ]);
        const propertyResult = await propertyResponse.json() as ApiResult<Property>;
        const mediaResult = await mediaResponse.json() as ApiResult<Media[]>;
        if (!propertyResponse.ok || !propertyResult.success || !propertyResult.data) throw new Error(propertyResult.error?.message ?? "Property details could not be loaded.");
        if (!cancelled) {
          setProperty(propertyResult.data);
          setMedia(mediaResult.success && Array.isArray(mediaResult.data) ? mediaResult.data : []);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Property details could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [propertyId]);

  async function submitEnquiry(event: FormEvent) {
    event.preventDefault();
    if (!property || !consent || !contact.trim() || sending) return;
    setSending(true);
    setMessage("");
    try {
      const sessionToken = window.sessionStorage.getItem("taurine-chat-session");
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: `I would like to request a viewing or agent follow-up about property ${property.property_id} (${property.property_type} in ${property.location ?? "the listed location"}). My contact information is ${contact.trim()}. I consent to Taurine contacting me about this enquiry.`,
          ...(sessionToken ? { sessionToken } : {}),
        }),
      });
      const result = await response.json() as ApiResult<{ message: string; sessionToken: string }>;
      if (!response.ok || !result.success || !result.data) throw new Error(result.error?.message ?? "Your enquiry could not be sent.");
      window.sessionStorage.setItem("taurine-chat-session", result.data.sessionToken);
      setMessage(result.data.message);
      setContact("");
      setConsent(false);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Your enquiry could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return <main className="detail-page">
    <header className="site-header detail-header"><Link className="brand" href="/"><span className="brand-mark">T</span><span>TAURINE<small>REAL ESTATE</small></span></Link><nav className="main-nav"><Link href="/#properties">Properties</Link><Link href="/#approach">Our approach</Link><Link href="/#contact">Contact</Link></nav><Link className="button button-dark button-small" href="/staff">Staff sign in ↗</Link></header>
    <div className="detail-container">
      <Link href="/#properties" className="text-link back-link">← Back to the collection</Link>
      {loading ? <div className="loading-state"><span className="spinner" /> Loading property details…</div> :
        error || !property ? <div className="empty-state"><h1>Property unavailable</h1><p>{error || "This listing could not be found."}</p><Link className="button button-dark button-small" href="/#properties">Browse properties</Link></div> :
          <>
            <div className="detail-title"><div><span className="eyebrow">{property.property_type} <span className="eyebrow-dot">/</span> {property.listing_status}</span><h1>{property.location || "A Taurine property"}</h1></div><strong>{formatPrice(property.listing_price)}</strong></div>
            <div className="gallery">
              <div className="gallery-main">
                {media[activeImage]?.media_url ? <img src={media[activeImage].media_url} alt={`${property.property_type} in ${property.location ?? "available location"}`} /> : <div className="photo-placeholder detail-placeholder">TAURINE <i>PROPERTY COLLECTION</i></div>}
                <span className="status-pill">{property.listing_status}</span>
              </div>
              {media.length > 1 && <div className="gallery-thumbs">{media.map((item, index) => <button className={activeImage === index ? "active" : ""} key={`${item.media_url}-${index}`} onClick={() => setActiveImage(index)} aria-label={`View image ${index + 1}`}><img src={item.media_url} alt="" /></button>)}</div>}
            </div>
            <div className="detail-content">
              <section className="property-description"><span className="eyebrow">THE DETAILS</span><h2>A little more<br /><em>about this place.</em></h2><p>{property.description || "Contact our team to learn more about this property and arrange a personal conversation."}</p>
                <div className="detail-stats"><div><b>{property.bedrooms ?? "—"}</b><span>BEDROOMS</span></div><div><b>{property.bathrooms ?? "—"}</b><span>BATHROOMS</span></div><div><b>{property.square_footage ? Number(property.square_footage).toLocaleString() : "—"}</b><span>SQUARE FEET</span></div><div><b>{property.year_built ?? "—"}</b><span>YEAR BUILT</span></div></div>
                {!!property.features?.length && <div className="features"><h3>Features</h3><ul>{property.features.map((feature) => <li key={feature}>{feature}</li>)}</ul></div>}
                {property.virtual_tour_url && <a className="text-link" href={property.virtual_tour_url} target="_blank" rel="noreferrer">Explore the virtual tour ↗</a>}
              </section>
              <aside className="enquiry-card"><span className="eyebrow">MAKE IT PERSONAL</span><h2>Could this be<br />your next place?</h2><p>Talk to a Taurine advisor about this listing. A viewing request is not a confirmed appointment; our team will follow up to arrange a time.</p>
                <button className="text-link button-plain detail-assistant-link" onClick={() => router.push(`/?propertyId=${encodeURIComponent(property.property_id)}#assistant`)}>Ask the property consultant about this listing ↗</button>
                {!showEnquiry ? <button className="button button-dark" onClick={() => setShowEnquiry(true)}>Request a viewing <span aria-hidden="true">↗</span></button> :
                  <form className="enquiry-form" onSubmit={submitEnquiry}><label htmlFor="contact-detail">Your email or phone number</label><input id="contact-detail" required maxLength={255} value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="on" />
                    <label className="checkbox-line"><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree Taurine may contact me about this property enquiry.</span></label>
                    {message && <p className={message.includes("could not") ? "form-error" : "form-success"} role="status">{message}</p>}
                    <button className="button button-dark" type="submit" disabled={sending || !consent}>{sending ? "Sending…" : "Send enquiry"} <span aria-hidden="true">↗</span></button></form>}
              </aside>
            </div>
          </>}
    </div>
    <footer className="site-footer"><Link className="brand brand-light" href="/"><span className="brand-mark">T</span><span>TAURINE<small>REAL ESTATE</small></span></Link><p>Thoughtful guidance. Homes with meaning.</p><span>© {new Date().getFullYear()} Taurine Real Estate</span></footer>
  </main>;
}
