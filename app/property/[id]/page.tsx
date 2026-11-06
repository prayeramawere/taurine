import PropertyDetail from "@/app/property/property-detail";

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PropertyDetail propertyId={id} />;
}
