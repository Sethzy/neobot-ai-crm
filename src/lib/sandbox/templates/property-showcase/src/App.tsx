/**
 * Root app shell for the property showcase template.
 */
import propertyData from "./data/property.json";
import { AgentContact } from "./components/AgentContact";
import { Comparables } from "./components/Comparables";
import { Hero } from "./components/Hero";
import { MortgageCalc } from "./components/MortgageCalc";
import { NeighborhoodMap } from "./components/NeighborhoodMap";
import { PhotoGallery } from "./components/PhotoGallery";
import { PropertyDetails } from "./components/PropertyDetails";
import type { PropertyData } from "./types";

const typedPropertyData = propertyData as PropertyData;

export default function App() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <Hero property={typedPropertyData} />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PhotoGallery photos={typedPropertyData.photos} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="flex flex-col gap-6">
            <PropertyDetails property={typedPropertyData} />
            <NeighborhoodMap neighborhood={typedPropertyData.neighborhood} />
            <Comparables comparables={typedPropertyData.comparables} />
          </div>
          <div className="flex flex-col gap-6">
            <MortgageCalc price={typedPropertyData.price} />
            <AgentContact agent={typedPropertyData.agent} />
          </div>
        </div>
      </main>
    </div>
  );
}
