const imageHost = "https://images.pexels.com";

// Each audited photo link supplies the Pexels ID; 520px matches the previous packaged source width.
export function imageSource(href: string) {
  const id = href.match(/-(\d+)\/$/)?.[1];
  if (!id) throw new Error(`Expected a Pexels photo link: ${href}`);
  return `${imageHost}/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=520`;
}

type Photo = {
  href: string;
  alt: string;
  y: number;
  smallY: number;
};

export const pages: Photo[][] = [
  [
    {
      href: "https://www.pexels.com/photo/orange-cat-looking-through-window-19665848/",
      alt: "Orange tabby curled beside a sunlit window",
      y: 50,
      smallY: 48,
    },
    {
      href: "https://www.pexels.com/photo/cozy-tabby-cat-watching-rain-at-window-33842880/",
      alt: "Tabby at a rain-streaked window",
      y: 70,
      smallY: 73,
    },
    {
      href: "https://www.pexels.com/photo/soft-portrait-of-an-orange-tabby-cat-by-a-window-35100882/",
      alt: "Orange cat peeking around a wall",
      y: 39,
      smallY: 36,
    },
  ],
  [
    {
      href: "https://www.pexels.com/photo/close-up-shot-of-an-orange-tabby-cat-on-the-window-14664878/",
      alt: "Orange tabby standing at a window",
      y: 56,
      smallY: 55,
    },
    {
      href: "https://www.pexels.com/photo/tabby-cat-gazing-out-window-in-soft-light-38005079/",
      alt: "Dark tabby looking out into daylight",
      y: 51,
      smallY: 34,
    },
    {
      href: "https://www.pexels.com/photo/cat-relaxing-in-sunlight-by-window-37293988/",
      alt: "Cat stretched out in a sunny windowsill",
      y: 55,
      smallY: 53,
    },
  ],
  [
    {
      href: "https://www.pexels.com/photo/cozy-cat-sitting-by-a-sunlit-window-30651640/",
      alt: "Tabby on a stone windowsill",
      y: 57,
      smallY: 54,
    },
    {
      href: "https://www.pexels.com/photo/tabby-cat-sitting-by-the-window-in-sunlight-36027275/",
      alt: "Tabby caught in a shaft of sunlight",
      y: 56,
      smallY: 59,
    },
    {
      href: "https://www.pexels.com/photo/cat-sitting-on-window-sill-near-curtains-4560972/",
      alt: "Cat peeking between curtains",
      y: 45,
      smallY: 43,
    },
  ],
  [
    {
      href: "https://www.pexels.com/photo/cozy-orange-tabby-cat-resting-on-sofa-38151505/",
      alt: "Orange tabby resting on a tan sofa",
      y: 55,
      smallY: 54,
    },
    {
      href: "https://www.pexels.com/photo/cozy-grey-cat-sleeping-on-soft-blanket-36559503/",
      alt: "Gray cat sleeping on a blanket",
      y: 57,
      smallY: 53,
    },
    {
      href: "https://www.pexels.com/photo/peaceful-calico-cat-sleeping-in-cozy-bed-35624326/",
      alt: "Calico curled in a woven bed",
      y: 52,
      smallY: 54,
    },
  ],
  [
    {
      href: "https://www.pexels.com/photo/photo-of-cat-sleeping-on-the-couch-3919680/",
      alt: "Tabby asleep on a brown sofa",
      y: 50,
      smallY: 49,
    },
    {
      href: "https://www.pexels.com/photo/cat-sleeping-on-sofa-26281575/",
      alt: "Cat sleeping with its paws out",
      y: 45,
      smallY: 45,
    },
    {
      href: "https://www.pexels.com/photo/close-up-of-a-sleeping-cat-14976551/",
      alt: "Fluffy cat curled up asleep",
      y: 52,
      smallY: 50,
    },
  ],
  [
    {
      href: "https://www.pexels.com/photo/cat-sleeping-in-bed-14599900/",
      alt: "Tabby curled up on a bed",
      y: 61,
      smallY: 60,
    },
    {
      href: "https://www.pexels.com/photo/photo-of-a-gray-sleeping-cat-12892405/",
      alt: "Gray cat tucked into a sofa",
      y: 57,
      smallY: 57,
    },
    {
      href: "https://www.pexels.com/photo/cozy-cat-sleeping-on-comfortable-couch-36932724/",
      alt: "Cat asleep on a beige couch",
      y: 59,
      smallY: 63,
    },
  ],
  [
    {
      href: "https://www.pexels.com/photo/serene-cat-resting-in-a-sunlit-garden-40379548/",
      alt: "Cat resting among garden plants",
      y: 53,
      smallY: 56,
    },
    {
      href: "https://www.pexels.com/photo/little-cat-in-a-garden-20341423/",
      alt: "Small orange and white cat in a garden",
      y: 55,
      smallY: 52,
    },
    {
      href: "https://www.pexels.com/photo/black-cat-on-green-grass-in-the-garden-28454353/",
      alt: "Black and white cat in green grass",
      y: 50,
      smallY: 48,
    },
  ],
  [
    {
      href: "https://www.pexels.com/photo/tabby-cat-strolling-in-sunlit-garden-40522668/",
      alt: "Tabby strolling through a garden",
      y: 55,
      smallY: 55,
    },
    {
      href: "https://www.pexels.com/photo/tabby-cat-in-sunlit-garden-setting-33495888/",
      alt: "Tabby sitting in sunlit grass",
      y: 51,
      smallY: 45,
    },
    {
      href: "https://www.pexels.com/photo/cat-on-grass-18507839/",
      alt: "White cat walking through grass",
      y: 52,
      smallY: 49,
    },
  ],
  [
    {
      href: "https://www.pexels.com/photo/cat-lying-down-among-flowers-17819109/",
      alt: "Cat lying among flowers",
      y: 48,
      smallY: 48,
    },
    {
      href: "https://www.pexels.com/photo/a-domestic-cat-sitting-on-the-grass-in-the-garden-19577532/",
      alt: "Cat sitting in a garden",
      y: 50,
      smallY: 49,
    },
    {
      href: "https://www.pexels.com/photo/a-cat-sitting-on-the-grass-near-a-tree-20000937/",
      alt: "Cat sitting in grass near a tree",
      y: 54,
      smallY: 60,
    },
  ],
  [
    {
      href: "https://www.pexels.com/photo/close-up-of-an-orange-cat-10841990/",
      alt: "Close-up of an orange tabby",
      y: 34,
      smallY: 39,
    },
    {
      href: "https://www.pexels.com/photo/close-up-of-a-calico-cat-s-face-with-green-eyes-36302916/",
      alt: "Close-up of a calico with green eyes",
      y: 43,
      smallY: 44,
    },
    {
      href: "https://www.pexels.com/photo/close-up-photograph-of-a-white-and-black-cat-with-white-whiskers-8879019/",
      alt: "Black and white cat with bright whiskers",
      y: 43,
      smallY: 44,
    },
  ],
  [
    {
      href: "https://www.pexels.com/photo/closeup-photography-of-white-brown-and-black-cat-236633/",
      alt: "Portrait of a white, brown, and black cat",
      y: 42,
      smallY: 45,
    },
    {
      href: "https://www.pexels.com/photo/close-up-of-a-calico-cat-with-green-eyes-35737295/",
      alt: "Front-on portrait of a green-eyed calico",
      y: 43,
      smallY: 45,
    },
    {
      href: "https://www.pexels.com/photo/black-and-white-cat-face-photo-2819645/",
      alt: "Close portrait of a black and white cat",
      y: 45,
      smallY: 47,
    },
  ],
  [
    {
      href: "https://www.pexels.com/photo/calico-cat-with-striking-green-eyes-close-up-36971939/",
      alt: "Calico cat looking straight ahead",
      y: 42,
      smallY: 43,
    },
    {
      href: "https://www.pexels.com/photo/white-and-black-cat-in-close-up-photography-9440571/",
      alt: "White and black cat in close-up",
      y: 41,
      smallY: 45,
    },
    {
      href: "https://www.pexels.com/photo/close-up-portrait-of-a-tabby-cat-in-black-and-white-28772024/",
      alt: "Black-and-white portrait of a tabby",
      y: 43,
      smallY: 45,
    },
  ],
];
