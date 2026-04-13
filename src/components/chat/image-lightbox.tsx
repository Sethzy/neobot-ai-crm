/**
 * Full-viewport image lightbox built on Radix Dialog primitives.
 * Opens when `src` is non-null, closes on Escape / backdrop click / back button.
 * @module components/chat/image-lightbox
 */
"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowLeft } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt = "Full size image", onClose }: ImageLightboxProps) {
  return (
    <DialogPrimitive.Root open={!!src} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 flex items-center justify-center outline-none">
          <DialogPrimitive.Title className="sr-only">{alt}</DialogPrimitive.Title>
          <Button
            variant="ghost"
            onClick={onClose}
            className="absolute left-4 top-4 z-10 h-10 w-10 rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          {src && (
            <img
              src={src}
              alt={alt}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
