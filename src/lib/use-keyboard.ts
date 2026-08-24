import { useEffect, useState } from "react";

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    const nonTextTypes = ["checkbox", "radio", "button", "submit", "hidden", "file", "image", "reset"];
    return !nonTextTypes.includes(type);
  }
  if (el.getAttribute("contenteditable") === "true") return true;
  return false;
}

export function useIsKeyboardOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Instant DOM Focus / Blur detection (works 100% on iOS Safari & WKWebView)
    const handleFocusIn = (e: FocusEvent) => {
      if (isTextInput(e.target as Element)) {
        setIsOpen(true);
        document.body.setAttribute("data-keyboard", "open");
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement;
        if (!isTextInput(active)) {
          setIsOpen(false);
          document.body.removeAttribute("data-keyboard");
        }
      }, 60);
    };

    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    // 2. Capacitor Keyboard Plugin
    let cleanupCapacitor: (() => void) | undefined;
    import("@capacitor/keyboard")
      .then(({ Keyboard }) => {
        const showSub = Keyboard.addListener("keyboardWillShow", () => {
          setIsOpen(true);
          document.body.setAttribute("data-keyboard", "open");
        });
        const didShowSub = Keyboard.addListener("keyboardDidShow", () => {
          setIsOpen(true);
          document.body.setAttribute("data-keyboard", "open");
        });
        const hideSub = Keyboard.addListener("keyboardWillHide", () => {
          setIsOpen(false);
          document.body.removeAttribute("data-keyboard");
        });
        const didHideSub = Keyboard.addListener("keyboardDidHide", () => {
          setIsOpen(false);
          document.body.removeAttribute("data-keyboard");
        });

        cleanupCapacitor = () => {
          showSub.then((s) => s.remove()).catch(() => {});
          didShowSub.then((s) => s.remove()).catch(() => {});
          hideSub.then((s) => s.remove()).catch(() => {});
          didHideSub.then((s) => s.remove()).catch(() => {});
        };
      })
      .catch(() => {});

    // 3. visualViewport resize detection (Safari / iOS WebView)
    const handleViewportResize = () => {
      if (window.visualViewport) {
        const isKeyboard = window.visualViewport.height < window.innerHeight * 0.75;
        if (isKeyboard) {
          setIsOpen(true);
          document.body.setAttribute("data-keyboard", "open");
        } else if (!isTextInput(document.activeElement)) {
          setIsOpen(false);
          document.body.removeAttribute("data-keyboard");
        }
      }
    };
    window.visualViewport?.addEventListener("resize", handleViewportResize);

    return () => {
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
      cleanupCapacitor?.();
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
      document.body.removeAttribute("data-keyboard");
    };
  }, []);

  return isOpen;
}
