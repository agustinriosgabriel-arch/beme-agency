# BEME Agency — Brand Identity Guide

> Source: Manual de Identidad Corporativa BEME  
> Assets location: `assets/brand/`

---

## Brand Name
**Beme** (stylized as "Be**me**" — "Be" in regular weight, "me" in bold)

## Logo Concept
The brand identifier is composed of two main elements:
- **Symbol:** An analogy of the brand name using two arcs representing the "B" and the "m", together with the "e" present in both words
- **Wordmark:** Written below the symbol in **Just Sans** (Regular + Bold)

### Logo Versions
| Version | Use |
|---------|-----|
| **Principal** | Symbol stacked vertically + wordmark below (default) |
| **Secundaria** | Symbol arranged horizontally + wordmark beside |
| **Color on white** | Pantone 220c magenta on white background |
| **White on color** | White logo on Pantone 220c magenta background |
| **Black on white** | Black logo on white background |
| **White on black** | White logo on black background |

### Logo Rules — NOT Allowed
- Off-center distribution of elements
- Significant reduction of logotype or graphic element relative to the other
- Deformation of any element
- Separation of "Be" and "me" into different lines
- Disproportionate scaling between symbol and wordmark

### Minimum Reproduction Size
| Medium | Min size |
|--------|----------|
| Screen Printing (Serigrafía) | 30 mm |
| Offset Print | 25 mm |
| Digital Media | 100 px |

---

## Color Palette

### Primary Color
| Name | Pantone | HEX | RGB | CMYK |
|------|---------|-----|-----|------|
| **Beme Magenta** | Pantone 220 C | `#b2005d` | R:178 G:0 B:93 | C:22 M:100 Y:28 K:12 |

> The identifier uses a single color — Pantone 220c — which is the protagonist in most graphic pieces, providing easy recognition and brand representation.

### Secondary Colors
| Name | HEX | Usage |
|------|-----|-------|
| **Near Black** | `#1c1c1c` | Text, dark backgrounds |
| **Off White** | `#f4f4f4` | Light backgrounds, cards |
| **Beme Purple** | `#9414E0` | Accent, secondary elements |

### Additional Colors
| Name | HEX | Usage |
|------|-----|-------|
| **Light Gray** | `#e2e2e2` | Subtle backgrounds, borders |
| **Dark Gray** | `#3c3c3b` | Secondary text |
| **Soft Pink** | `#ed568f` | Accents, highlights |
| **Deep Purple** | `#440b5d` | Dark accents |

### Brand Gradients
| Gradient | From | To |
|----------|------|----|
| **Magenta to Pink** | `#B2005D` | `#ed568f` |
| **Deep Purple to Purple** | `#440b5d` | `#9414e0` |
| **Purple to Hot Pink** | `#9414e0` | `#d90e86` |

### CSS Variables (ready to use)
```css
:root {
  /* Primary */
  --beme-primary: #b2005d;
  --beme-primary-rgb: 178, 0, 93;
  
  /* Secondary */
  --beme-black: #1c1c1c;
  --beme-white: #f4f4f4;
  --beme-purple: #9414E0;
  
  /* Additional */
  --beme-light-gray: #e2e2e2;
  --beme-dark-gray: #3c3c3b;
  --beme-soft-pink: #ed568f;
  --beme-deep-purple: #440b5d;
  --beme-hot-pink: #d90e86;
  
  /* Gradients */
  --beme-gradient-magenta: linear-gradient(135deg, #B2005D, #ed568f);
  --beme-gradient-purple: linear-gradient(135deg, #440b5d, #9414e0);
  --beme-gradient-vibrant: linear-gradient(135deg, #9414e0, #d90e86);
}
```

---

## Typography

### Primary Font: **Just Sans**
- Used in both the logo identifier and all brand graphic pieces
- Works for headings and body text, digital and print
- Conveys dynamism and formality

| Weight | Usage |
|--------|-------|
| ExtraLight | Subtle labels, decorative |
| Light | Body text (light variant) |
| **Regular** | Body text (default) |
| Medium | Subheadings, emphasis |
| **SemiBold** | Subheadings, buttons |
| **Bold** | Headings, CTAs, "me" in logo |
| ExtraBold | Display headings, hero text |

### Web Fallback Stack
Since Just Sans is a custom font, use this CSS fallback:
```css
font-family: 'Just Sans', 'Inter', 'Helvetica Neue', Arial, sans-serif;
```

---

## Brand Voice & Personality
- **Industry:** Talent marketing & influencer agency
- **Tone:** Dynamic, professional, youthful, empowering
- **Tagline essence:** "Be yourself" — the brand name itself is an invitation to authenticity
- **Visual personality:** Bold magenta as hero color conveys confidence, energy, and creativity

---

## Assets Inventory

### Available in `assets/brand/`
```
assets/brand/
├── Manual-Beme.pdf              → Full brand identity manual (8 pages)
└── logos/
    ├── Beme-Logo.ai             → Vector logo (Illustrator)
    ├── Beme1Color.png           → Primary logo — Pantone 220c magenta (#b2005d)
    ├── Beme1negro.png           → Black version — for white/light backgrounds
    └── Beme1blanco.png          → White version — for dark/color backgrounds
```
