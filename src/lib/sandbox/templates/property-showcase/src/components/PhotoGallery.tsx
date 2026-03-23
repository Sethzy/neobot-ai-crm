/**
 * Photo gallery section for the property showcase template.
 */
import type { PropertyPhoto } from "../types";

interface PhotoGalleryProps {
  photos: PropertyPhoto[];
}

export function PhotoGallery({ photos }: PhotoGalleryProps) {
  if (photos.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/6 p-4 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-stone-400">Gallery</p>
          <h2 className="text-2xl font-semibold text-white">Walk the home visually</h2>
        </div>
        <p className="text-sm text-stone-300">{photos.length} photos</p>
      </div>
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <img
          alt={photos[0].alt}
          className="h-[360px] w-full rounded-[1.5rem] object-cover"
          src={photos[0].src}
        />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
          {photos.slice(1).map((photo) => (
            <img
              key={photo.src}
              alt={photo.alt}
              className="h-[172px] w-full rounded-[1.5rem] object-cover"
              src={photo.src}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
