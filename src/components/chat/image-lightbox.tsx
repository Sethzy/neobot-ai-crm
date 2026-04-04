/**
 * Full-viewport image lightbox built on shadcn Dialog.
 * Opens when `src` is non-null, closes on Escape / backdrop click.
 * @module components/chat/image-lightbox
 */
"use client";

import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt = "Full size image", onClose }: ImageLightboxProps) {
  return (
    <Dialog open={!!src} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPortal>
        <DialogOverlay className="bg-black/80" />
        <DialogContent
          showCloseButton={false}
          className="max-w-[90vw] max-h-[90vh] border-none bg-transparent p-0 shadow-none ring-0"
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {src && (
            <img
              src={src}
              alt={alt}
              className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
