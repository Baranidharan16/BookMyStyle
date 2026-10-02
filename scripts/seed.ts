/**
 * Development seed — realistic demo data for BookMyStyle.
 * Run:  npm run db:seed      (refuses to run when NODE_ENV=production)
 *
 * All seeded bookings are allocated through the real availability engine,
 * so they respect seats, staff schedules, breaks, buffers and the DB
 * exclusion constraints — dashboards look busy without impossible data.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../src/server/db";
import * as s from "../src/server/db/schema";
import { hashPassword } from "../src/server/auth/password";
import { loadDayContext, loadServiceSelection } from "../src/server/booking/context";
import { evaluateSlot, type Interval } from "../src/server/booking/engine-core";
import { computeQuote } from "../src/server/booking/policy-core";
import { DEFAULT_PLATFORM_CONFIG } from "../src/server/settings";
import { addDaysKey, toDateKey, weekdayOf, zonedToUtc } from "../src/lib/time";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database.");
  process.exit(1);
}

/* ------------------------------------------------------------ utilities */
let seed = 20261005;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;
const chance = (p: number) => rand() < p;
const rupees = (r: number) => r * 100;
const H = (h: number, m = 0) => h * 60 + m;
const TZ = "Asia/Kolkata";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Password@123";
const today = toDateKey(new Date(), TZ);
const usedCodes = new Set<string>();
function bookingCode(date: string, preferred?: number) {
  let n = preferred ?? Math.floor(rand() * 10000);
  let code = "";
  do code = `SAL-${date.replaceAll("-", "")}-${String(n++ % 10000).padStart(4, "0")}`;
  while (usedCodes.has(code));
  usedCodes.add(code);
  return code;
}

/* --------------------------------------------------------------- catalog */
const CATEGORIES = [
  ["haircut", "Haircut", "scissors"],
  ["hair-styling", "Hair Styling", "wind"],
  ["hair-coloring", "Hair Coloring", "palette"],
  ["hair-spa", "Hair Spa", "droplets"],
  ["beard-grooming", "Beard Grooming", "user-round"],
  ["shaving", "Shaving", "slice"],
  ["facial", "Facial", "sparkles"],
  ["cleanup", "Cleanup", "spray-can"],
  ["manicure", "Manicure", "hand"],
  ["pedicure", "Pedicure", "footprints"],
  ["nail-care", "Nail Care", "gem"],
  ["leg-spa", "Leg Spa", "waves"],
  ["head-massage", "Head Massage", "brain"],
  ["body-spa", "Body Spa", "flower-2"],
  ["bridal-makeup", "Bridal Makeup", "crown"],
  ["party-makeup", "Party Makeup", "party-popper"],
  ["makeup", "Makeup", "brush"],
  ["waxing", "Waxing", "flame"],
  ["threading", "Threading", "spline"],
  ["skin-care", "Skin Care", "sun"],
  ["kids-haircut", "Kids Haircut", "baby"],
  ["grooming-packages", "Grooming Packages", "package"],
] as const;

const AREAS: [string, string, number, number][] = [
  ["T. Nagar", "Chennai", 13.0418, 80.2341],
  ["Anna Nagar", "Chennai", 13.085, 80.2101],
  ["Adyar", "Chennai", 13.0012, 80.2565],
  ["Velachery", "Chennai", 12.9815, 80.218],
  ["Mylapore", "Chennai", 13.0339, 80.2619],
  ["Nungambakkam", "Chennai", 13.0569, 80.2425],
  ["Besant Nagar", "Chennai", 12.999, 80.2707],
  ["Thoraipakkam", "Chennai", 12.9416, 80.2362],
  ["Porur", "Chennai", 13.0382, 80.1565],
  ["Tambaram", "Chennai", 12.9249, 80.1],
  ["Egmore", "Chennai", 13.0732, 80.2609],
  ["Kilpauk", "Chennai", 13.0839, 80.2414],
  ["Guindy", "Chennai", 13.0067, 80.2206],
  ["Alwarpet", "Chennai", 13.0336, 80.2534],
  ["Sholinganallur", "Chennai", 12.901, 80.2279],
  ["Indiranagar", "Bengaluru", 12.9719, 77.6412],
  ["Koramangala", "Bengaluru", 12.9352, 77.6245],
  ["HSR Layout", "Bengaluru", 12.9116, 77.6474],
  ["Whitefield", "Bengaluru", 12.9698, 77.75],
  ["Jayanagar", "Bengaluru", 12.9308, 77.5838],
];

type Opt = [name: string, price: number, minutes: number];
type Group = { name: string; multi?: boolean; required?: boolean; options: Opt[] };
type SvcT = {
  key: string;
  name: string;
  cat: string;
  price: number;
  dur: number;
  buffer?: number;
  prep?: number;
  res: [type: string, qty: number][];
  staff?: number;
  gender?: "UNISEX" | "MEN" | "WOMEN" | "KIDS";
  desc: string;
  groups?: Group[];
};

const HAIRCUT_GROUPS: Group[] = [
  { name: "Hair length", required: true, options: [["Short", 0, 0], ["Medium", 50, 5], ["Long", 100, 10]] },
  { name: "Cut style", options: [["Classic trim", 0, 0], ["Layer cut", 100, 10], ["Fade", 80, 10], ["Styling finish", 60, 5]] },
];

const SERVICES: SvcT[] = [
  { key: "haircut-men", name: "Haircut", cat: "haircut", price: 250, dur: 30, buffer: 10, res: [["Haircut Chair", 1]], gender: "MEN", desc: "Precision cut with wash and styling finish.", groups: HAIRCUT_GROUPS },
  { key: "premium-haircut", name: "Premium Haircut", cat: "haircut", price: 400, dur: 45, buffer: 10, res: [["Haircut Chair", 1]], gender: "MEN", desc: "Consultation, shampoo, precision cut, hot towel and styling.", groups: HAIRCUT_GROUPS },
  { key: "haircut-women", name: "Haircut & Blow-dry", cat: "haircut", price: 650, dur: 45, buffer: 10, res: [["Haircut Chair", 1]], gender: "WOMEN", desc: "Cut tailored to your face shape with a smooth blow-dry.", groups: HAIRCUT_GROUPS },
  { key: "kids-haircut", name: "Kids Haircut", cat: "kids-haircut", price: 200, dur: 25, buffer: 5, res: [["Haircut Chair", 1]], gender: "KIDS", desc: "Patient, playful cuts for kids under 12." },
  { key: "beard-trim", name: "Beard Trim", cat: "beard-grooming", price: 150, dur: 20, buffer: 5, res: [["Haircut Chair", 1]], gender: "MEN", desc: "Shape-up and line-up with hot towel.", groups: [{ name: "Beard service", required: true, options: [["Trim", 0, 0], ["Styling", 100, 10], ["Full grooming", 200, 15]] }] },
  { key: "shave", name: "Royal Hot-Towel Shave", cat: "shaving", price: 250, dur: 25, buffer: 5, res: [["Haircut Chair", 1]], gender: "MEN", desc: "Classic straight-razor shave with pre-shave oil and hot towels." },
  { key: "hair-styling", name: "Hair Styling", cat: "hair-styling", price: 500, dur: 40, buffer: 10, res: [["Haircut Chair", 1]], desc: "Blow-dry, curls or sleek straight styling for any occasion." },
  { key: "hair-spa", name: "Hair Spa", cat: "hair-spa", price: 900, dur: 60, buffer: 10, res: [["Haircut Chair", 1]], desc: "Deep-conditioning ritual with scalp massage and steam.", groups: [{ name: "Add-ons", multi: true, options: [["Hair wash", 0, 0], ["Anti-dandruff treatment", 300, 15], ["Keratin boost", 600, 20]] }] },
  { key: "hair-color", name: "Hair Coloring", cat: "hair-coloring", price: 1500, dur: 90, buffer: 15, res: [["Haircut Chair", 1]], desc: "Ammonia-free colour by certified colourists.", groups: [{ name: "Colour service", required: true, options: [["Root touch-up", 0, 0], ["Global colour", 1000, 30], ["Highlights", 1800, 45]] }] },
  { key: "keratin", name: "Keratin Treatment", cat: "hair-spa", price: 4500, dur: 150, buffer: 15, res: [["Haircut Chair", 1]], desc: "Frizz-free, glossy hair for up to 4 months.", groups: [{ name: "Treatment", required: true, options: [["Keratin", 0, 0], ["Straightening", 1500, 30], ["Smoothening", 800, 20]] }] },
  { key: "head-massage", name: "Head Massage", cat: "head-massage", price: 300, dur: 20, buffer: 5, res: [["Haircut Chair", 1]], desc: "Ayurvedic oil massage to melt away stress." },
  { key: "facial", name: "Signature Facial", cat: "facial", price: 900, dur: 45, buffer: 15, res: [["Facial Bed", 1]], desc: "Customised facial with cleansing, exfoliation and mask.", groups: [{ name: "Facial type", required: true, options: [["Basic", 0, 0], ["Deep cleansing", 500, 15], ["Acne care", 700, 15], ["Glow facial", 1100, 20]] }] },
  { key: "cleanup", name: "Express Cleanup", cat: "cleanup", price: 600, dur: 30, buffer: 10, res: [["Facial Bed", 1]], desc: "Quick deep-clean for instantly fresh skin." },
  { key: "skin-care", name: "Hydra Skin Therapy", cat: "skin-care", price: 2500, dur: 60, buffer: 15, res: [["Facial Bed", 1]], desc: "Hydra-dermabrasion for deep hydration and glow." },
  { key: "waxing", name: "Waxing", cat: "waxing", price: 500, dur: 40, buffer: 10, res: [["Facial Bed", 1]], gender: "WOMEN", desc: "Rica / chocolate wax with soothing aftercare.", groups: [{ name: "Area", multi: true, required: true, options: [["Full arms", 0, 0], ["Full legs", 300, 15], ["Underarms", 100, 5], ["Full body", 1500, 45]] }] },
  { key: "threading", name: "Threading", cat: "threading", price: 80, dur: 15, buffer: 5, res: [["Haircut Chair", 1]], gender: "WOMEN", desc: "Eyebrow & face threading by experts." },
  { key: "manicure", name: "Classic Manicure", cat: "manicure", price: 600, dur: 40, buffer: 10, res: [["Manicure Station", 1]], desc: "Shape, cuticle care, massage and polish." },
  { key: "pedicure", name: "Spa Pedicure", cat: "pedicure", price: 800, dur: 50, buffer: 10, res: [["Pedicure Chair", 1]], desc: "Soak, scrub, massage and polish." },
  { key: "nail-art", name: "Gel Nail Art", cat: "nail-care", price: 1200, dur: 60, buffer: 10, res: [["Manicure Station", 1]], desc: "Long-lasting gel extensions and custom nail art." },
  { key: "leg-spa", name: "Leg Spa", cat: "leg-spa", price: 700, dur: 40, buffer: 10, res: [["Pedicure Chair", 1]], desc: "Relaxing leg massage with mineral salt soak." },
  { key: "body-spa", name: "Balinese Body Spa", cat: "body-spa", price: 2800, dur: 90, buffer: 20, res: [["Spa Room", 1]], desc: "Full-body Balinese massage with aromatic oils." },
  { key: "party-makeup", name: "Party Makeup", cat: "party-makeup", price: 3500, dur: 75, buffer: 15, res: [["Makeup Room", 1]], gender: "WOMEN", desc: "HD makeup with lashes and hairstyling touch-up." },
  { key: "makeup", name: "Everyday Makeup", cat: "makeup", price: 1500, dur: 45, buffer: 10, res: [["Makeup Room", 1]], desc: "Natural, camera-ready makeup look." },
  {
    key: "bridal",
    name: "Bridal Makeup",
    cat: "bridal-makeup",
    price: 8500,
    dur: 150,
    buffer: 30,
    prep: 15,
    staff: 2,
    res: [["Makeup Room", 1]],
    gender: "WOMEN",
    desc: "Complete bridal look by a makeup artist and hair stylist, in a private suite.",
    groups: [{ name: "Bridal add-ons", multi: true, options: [["Hair styling", 2000, 30], ["Saree draping", 1000, 20], ["Nail service", 1500, 30]] }],
  },
  { key: "grooming-package", name: "Groom's Grooming Package", cat: "grooming-packages", price: 1999, dur: 120, buffer: 15, res: [["Haircut Chair", 1]], gender: "MEN", desc: "Haircut, beard styling, facial cleanup and head massage." },
];

type StaffT = { name: string; title: string; spec: string; exp: number; skills: string[]; days?: number[]; start?: number; end?: number; brk?: [number, number]; login?: string };

type SalonT = {
  name: string;
  area: string;
  tagline: string;
  gender: "UNISEX" | "MEN" | "WOMEN";
  color: string;
  owner: string;
  rating: number;
  plan: "FREE" | "PRO" | "PREMIUM";
  featured?: boolean;
  amenities: string[];
  parking: string;
  accessibility: string;
  hours: { days: number[]; shifts: [number, number][] }[];
  resources: [type: string, area: string, count: number][];
  services: string[];
  priceFactor: number;
  staff: StaffT[];
  policy?: Partial<typeof s.salonPolicies.$inferInsert>;
  status?: "APPROVED" | "PENDING";
  busy: number; // average bookings/day
};

const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];
const MON_SAT = [1, 2, 3, 4, 5, 6];

const SALONS: SalonT[] = [
  {
    name: "Urban Cuts",
    area: "T. Nagar",
    tagline: "Sharp cuts. Sharper service.",
    gender: "MEN",
    color: "#0f766e",
    owner: "owner@example.com",
    rating: 4.6,
    plan: "PRO",
    featured: true,
    amenities: ["Air conditioned", "Wi-Fi", "Card & UPI", "Complimentary coffee", "Television"],
    parking: "Two-wheeler parking in front; paid car parking at Pondy Bazaar complex (2 min walk).",
    accessibility: "Ground floor, step-free entrance.",
    hours: [{ days: MON_SAT, shifts: [[H(9), H(21)]] }, { days: [0], shifts: [[H(10), H(18)]] }],
    resources: [["Haircut Chair", "Haircut Area", 5], ["Facial Bed", "Facial Area", 1]],
    services: ["haircut-men", "premium-haircut", "kids-haircut", "beard-trim", "shave", "hair-spa", "hair-color", "head-massage", "cleanup", "grooming-package"],
    priceFactor: 1,
    busy: 14,
    staff: [
      { name: "Arun Kumar", title: "Senior Barber", spec: "Fades & classic cuts", exp: 9, skills: ["haircut-men", "premium-haircut", "beard-trim", "hair-styling", "shave", "grooming-package"], days: MON_SAT, start: H(10), end: H(20), brk: [H(13), H(14)], login: "staff@example.com" },
      { name: "Karthik Raja", title: "Stylist", spec: "Modern textures", exp: 5, skills: ["haircut-men", "premium-haircut", "kids-haircut", "beard-trim", "hair-spa", "hair-color"], days: [0, 1, 2, 3, 4, 5], start: H(9), end: H(18), brk: [H(13, 30), H(14, 15)] },
      { name: "Vijay Anand", title: "Stylist", spec: "Beard sculpting", exp: 6, skills: ["haircut-men", "premium-haircut", "beard-trim", "shave", "head-massage", "grooming-package"], days: [0, 2, 3, 4, 5, 6], start: H(12), end: H(21), brk: [H(16), H(16, 30)] },
      { name: "Imran Sheikh", title: "Colour Specialist", spec: "Colour & hair spa", exp: 7, skills: ["hair-color", "hair-spa", "head-massage", "haircut-men", "cleanup", "grooming-package"], days: MON_SAT, start: H(10), end: H(19), brk: [H(14), H(14, 45)] },
      { name: "Suresh Babu", title: "Junior Barber", spec: "Kids & quick trims", exp: 2, skills: ["haircut-men", "kids-haircut", "beard-trim", "cleanup"], days: ALL_WEEK, start: H(9), end: H(17), brk: [H(13), H(13, 30)] },
    ],
  },
  {
    name: "Glow Beauty Studio",
    area: "Anna Nagar",
    tagline: "Skin, hair & nails — done beautifully.",
    gender: "WOMEN",
    color: "#be185d",
    owner: "owner@example.com",
    rating: 4.7,
    plan: "PREMIUM",
    featured: true,
    amenities: ["Air conditioned", "Women-only staff", "Card & UPI", "Organic products", "Wi-Fi"],
    parking: "Street parking on 2nd Avenue.",
    accessibility: "First floor with lift access.",
    hours: [{ days: ALL_WEEK, shifts: [[H(10), H(20, 30)]] }],
    resources: [["Haircut Chair", "Hair Studio", 3], ["Facial Bed", "Skin Lounge", 2], ["Manicure Station", "Nail Bar", 2], ["Pedicure Chair", "Nail Bar", 2], ["Makeup Room", "Bridal Suite", 1]],
    services: ["haircut-women", "hair-styling", "hair-spa", "hair-color", "keratin", "facial", "cleanup", "skin-care", "waxing", "threading", "manicure", "pedicure", "nail-art", "party-makeup", "bridal"],
    priceFactor: 1.15,
    busy: 12,
    policy: { refundType: "PARTIAL", cancellationTiers: [{ hoursBefore: 24, refundPercent: 100 }, { hoursBefore: 4, refundPercent: 50 }], graceMinutes: 15 },
    staff: [
      { name: "Priyanka Das", title: "Makeup Artist", spec: "Bridal & HD makeup", exp: 8, skills: ["party-makeup", "bridal", "hair-styling", "threading"], days: ALL_WEEK, start: H(10), end: H(20), brk: [H(14), H(14, 45)] },
      { name: "Revathi S", title: "Senior Stylist", spec: "Cuts & colour", exp: 10, skills: ["haircut-women", "hair-styling", "hair-color", "keratin", "hair-spa", "bridal"], days: [0, 1, 2, 3, 4, 6], start: H(10), end: H(19), brk: [H(13, 30), H(14, 15)] },
      { name: "Fathima Begum", title: "Skin Therapist", spec: "Facials & skin care", exp: 6, skills: ["facial", "cleanup", "skin-care", "waxing", "threading"], days: MON_SAT, start: H(10), end: H(20, 30), brk: [H(15), H(15, 30)] },
      { name: "Anitha Joseph", title: "Nail Technician", spec: "Gel & nail art", exp: 4, skills: ["manicure", "pedicure", "nail-art", "waxing"], days: [0, 2, 3, 4, 5, 6], start: H(11), end: H(20, 30), brk: [H(16), H(16, 30)] },
      { name: "Keerthana M", title: "Stylist", spec: "Blow-dry & spa", exp: 3, skills: ["haircut-women", "hair-styling", "hair-spa", "threading", "manicure", "pedicure", "cleanup"], days: ALL_WEEK, start: H(10), end: H(18), brk: [H(13), H(13, 30)] },
    ],
  },
  {
    name: "Style Hub",
    area: "Velachery",
    tagline: "Your neighbourhood unisex salon.",
    gender: "UNISEX",
    color: "#7c3aed",
    owner: "owner3@example.com",
    rating: 4.3,
    plan: "PRO",
    amenities: ["Air conditioned", "Card & UPI", "Kids friendly", "Wi-Fi"],
    parking: "Free parking in Phoenix Marketcity basement (validated).",
    accessibility: "Mall level 1, lift & ramp access.",
    hours: [{ days: ALL_WEEK, shifts: [[H(10), H(21)]] }],
    resources: [["Haircut Chair", "Haircut Area", 6], ["Facial Bed", "Facial Area", 2], ["Manicure Station", "Nail Bar", 2], ["Makeup Room", "Bridal Suite", 1]],
    services: ["haircut-men", "haircut-women", "kids-haircut", "beard-trim", "hair-styling", "hair-spa", "hair-color", "facial", "cleanup", "manicure", "nail-art", "threading", "makeup", "bridal"],
    priceFactor: 0.95,
    busy: 16,
    staff: [
      { name: "Manoj Kumar", title: "Senior Stylist", spec: "Men's grooming", exp: 8, skills: ["haircut-men", "beard-trim", "hair-styling", "hair-spa", "kids-haircut"], days: ALL_WEEK, start: H(10), end: H(19), brk: [H(13), H(13, 45)] },
      { name: "Sangeetha R", title: "Stylist", spec: "Women's cuts", exp: 6, skills: ["haircut-women", "hair-styling", "hair-color", "threading", "bridal"], days: MON_SAT, start: H(11), end: H(21), brk: [H(15), H(15, 30)] },
      { name: "Dinesh P", title: "Stylist", spec: "Colour", exp: 5, skills: ["haircut-men", "hair-color", "hair-spa", "beard-trim", "kids-haircut"], days: [0, 1, 2, 4, 5, 6], start: H(12), end: H(21), brk: [H(16), H(16, 30)] },
      { name: "Lavanya K", title: "Beautician", spec: "Facials & nails", exp: 7, skills: ["facial", "cleanup", "manicure", "nail-art", "threading", "makeup", "bridal"], days: ALL_WEEK, start: H(10), end: H(19), brk: [H(14), H(14, 30)] },
      { name: "Ravi Shankar", title: "Barber", spec: "Quick cuts", exp: 3, skills: ["haircut-men", "kids-haircut", "beard-trim"], days: [0, 1, 3, 4, 5, 6], start: H(10), end: H(18), brk: [H(13, 30), H(14)] },
      { name: "Pavithra N", title: "Makeup Artist", spec: "Party & bridal", exp: 5, skills: ["makeup", "bridal", "hair-styling", "facial"], days: [0, 3, 4, 5, 6], start: H(11), end: H(21), brk: [H(15, 30), H(16)] },
    ],
  },
  {
    name: "The Grooming Lounge",
    area: "Nungambakkam",
    tagline: "A gentleman's club for grooming.",
    gender: "MEN",
    color: "#1e293b",
    owner: "owner4@example.com",
    rating: 4.8,
    plan: "PREMIUM",
    featured: true,
    amenities: ["Air conditioned", "Complimentary beverages", "Valet parking", "Card & UPI", "Private lounge"],
    parking: "Valet parking available.",
    accessibility: "Step-free access, accessible washroom.",
    hours: [{ days: [2, 3, 4, 5, 6, 0], shifts: [[H(11), H(21)]] }],
    resources: [["Haircut Chair", "Barber Floor", 4], ["Facial Bed", "Grooming Suite", 1], ["Spa Room", "Spa", 1]],
    services: ["premium-haircut", "beard-trim", "shave", "hair-spa", "hair-color", "head-massage", "cleanup", "skin-care", "body-spa", "grooming-package"],
    priceFactor: 1.6,
    busy: 9,
    policy: { refundType: "PARTIAL", cancellationTiers: [{ hoursBefore: 12, refundPercent: 100 }, { hoursBefore: 3, refundPercent: 50 }], minAdvanceMinutes: 60 },
    staff: [
      { name: "Rahul Menon", title: "Master Barber", spec: "Straight-razor shaves", exp: 14, skills: ["premium-haircut", "beard-trim", "shave", "grooming-package", "head-massage"], days: [2, 3, 4, 5, 6, 0], start: H(11), end: H(21), brk: [H(15), H(15, 45)] },
      { name: "Joseph Thomas", title: "Senior Barber", spec: "Classic cuts", exp: 9, skills: ["premium-haircut", "beard-trim", "shave", "hair-color", "hair-spa"], days: [2, 3, 4, 5, 6], start: H(11), end: H(20), brk: [H(14), H(14, 45)] },
      { name: "Sameer Khan", title: "Therapist", spec: "Skin & spa", exp: 6, skills: ["cleanup", "skin-care", "body-spa", "head-massage", "grooming-package"], days: [3, 4, 5, 6, 0], start: H(12), end: H(21), brk: [H(16), H(16, 30)] },
    ],
  },
  {
    name: "Elite Salon",
    area: "Adyar",
    tagline: "Premium unisex styling since 2012.",
    gender: "UNISEX",
    color: "#b45309",
    owner: "owner5@example.com",
    rating: 4.4,
    plan: "PRO",
    amenities: ["Air conditioned", "Card & UPI", "Wi-Fi", "Couple packages"],
    parking: "Dedicated parking for 6 cars.",
    accessibility: "Ground floor, ramp available.",
    hours: [{ days: MON_SAT, shifts: [[H(9, 30), H(20, 30)]] }, { days: [0], shifts: [[H(10), H(19)]] }],
    resources: [["Haircut Chair", "Styling Floor", 5], ["Facial Bed", "Skin Room", 2], ["Pedicure Chair", "Nail Bar", 1], ["Manicure Station", "Nail Bar", 1]],
    services: ["haircut-men", "haircut-women", "premium-haircut", "beard-trim", "hair-styling", "hair-spa", "hair-color", "keratin", "facial", "skin-care", "waxing", "threading", "manicure", "pedicure"],
    priceFactor: 1.25,
    busy: 11,
    staff: [
      { name: "Nandhini V", title: "Creative Director", spec: "Keratin & colour", exp: 12, skills: ["haircut-women", "hair-color", "keratin", "hair-styling", "hair-spa"], days: MON_SAT, start: H(10), end: H(19), brk: [H(14), H(14, 45)] },
      { name: "Prakash R", title: "Senior Stylist", spec: "Men's styling", exp: 8, skills: ["haircut-men", "premium-haircut", "beard-trim", "hair-spa", "hair-color"], days: [0, 1, 2, 3, 5, 6], start: H(9, 30), end: H(18, 30), brk: [H(13, 30), H(14, 15)] },
      { name: "Shalini George", title: "Skin Expert", spec: "Hydra facials", exp: 7, skills: ["facial", "skin-care", "waxing", "threading"], days: MON_SAT, start: H(11), end: H(20, 30), brk: [H(15, 30), H(16)] },
      { name: "Bala Murugan", title: "Stylist", spec: "Versatile", exp: 4, skills: ["haircut-men", "haircut-women", "beard-trim", "hair-styling", "manicure", "pedicure"], days: ALL_WEEK, start: H(10), end: H(19), brk: [H(13), H(13, 30)] },
    ],
  },
  {
    name: "Blossom Beauty Spa",
    area: "Besant Nagar",
    tagline: "Unwind by the beach.",
    gender: "WOMEN",
    color: "#059669",
    owner: "owner6@example.com",
    rating: 4.5,
    plan: "FREE",
    amenities: ["Air conditioned", "Steam room", "Organic products", "Card & UPI", "Herbal tea"],
    parking: "Free parking on 6th Avenue.",
    accessibility: "Ground floor.",
    hours: [{ days: ALL_WEEK, shifts: [[H(10), H(20)]] }],
    resources: [["Spa Room", "Spa Suites", 2], ["Facial Bed", "Skin Lounge", 3], ["Pedicure Chair", "Foot Spa", 2], ["Manicure Station", "Foot Spa", 1]],
    services: ["body-spa", "facial", "cleanup", "skin-care", "waxing", "manicure", "pedicure", "leg-spa", "head-massage"],
    priceFactor: 1.1,
    busy: 8,
    policy: { refundType: "REFUNDABLE", minAdvanceMinutes: 60, slotIntervalMinutes: 30 },
    staff: [
      { name: "Malini Iyer", title: "Spa Therapist", spec: "Balinese & Swedish", exp: 9, skills: ["body-spa", "head-massage", "leg-spa"], days: ALL_WEEK, start: H(10), end: H(19), brk: [H(14), H(14, 45)] },
      { name: "Gayathri S", title: "Spa Therapist", spec: "Aromatherapy", exp: 5, skills: ["body-spa", "head-massage", "facial", "cleanup"], days: [0, 1, 2, 3, 4, 5], start: H(11), end: H(20), brk: [H(15), H(15, 30)] },
      { name: "Divya Ramesh", title: "Esthetician", spec: "Facials", exp: 6, skills: ["facial", "cleanup", "skin-care", "waxing"], days: ALL_WEEK, start: H(10), end: H(18), brk: [H(13), H(13, 30)] },
      { name: "Selvi P", title: "Nail Technician", spec: "Foot spa", exp: 4, skills: ["manicure", "pedicure", "leg-spa", "waxing"], days: [0, 2, 3, 4, 5, 6], start: H(11), end: H(20), brk: [H(16), H(16, 30)] },
    ],
  },
  {
    name: "Classic Cuts",
    area: "Mylapore",
    tagline: "Honest haircuts, fair prices.",
    gender: "MEN",
    color: "#dc2626",
    owner: "owner7@example.com",
    rating: 4.1,
    plan: "FREE",
    amenities: ["Air conditioned", "UPI accepted", "Newspaper & TV"],
    parking: "Limited two-wheeler parking.",
    accessibility: "One step at entrance.",
    hours: [{ days: [0, 1, 3, 4, 5, 6], shifts: [[H(8), H(20)]] }],
    resources: [["Haircut Chair", "Barber Floor", 3]],
    services: ["haircut-men", "kids-haircut", "beard-trim", "shave", "head-massage"],
    priceFactor: 0.7,
    busy: 12,
    policy: { refundType: "NON_REFUNDABLE", minAdvanceMinutes: 15, slotIntervalMinutes: 15, allowReschedule: true },
    staff: [
      { name: "Murugesan", title: "Barber", spec: "Traditional cuts", exp: 20, skills: ["haircut-men", "kids-haircut", "beard-trim", "shave", "head-massage"], days: [0, 1, 3, 4, 5, 6], start: H(8), end: H(16), brk: [H(12), H(12, 45)] },
      { name: "Senthil", title: "Barber", spec: "Kids specialist", exp: 8, skills: ["haircut-men", "kids-haircut", "beard-trim", "shave"], days: [0, 1, 3, 4, 5, 6], start: H(12), end: H(20), brk: [H(16), H(16, 30)] },
      { name: "Ganesh", title: "Barber", spec: "Shaves", exp: 5, skills: ["haircut-men", "beard-trim", "shave", "head-massage"], days: [1, 3, 4, 5, 6], start: H(9), end: H(18), brk: [H(13), H(13, 30)] },
    ],
  },
  {
    name: "Urban Glow",
    area: "Thoraipakkam",
    tagline: "OMR's favourite after-work salon.",
    gender: "UNISEX",
    color: "#0284c7",
    owner: "owner8@example.com",
    rating: 4.2,
    plan: "FREE",
    amenities: ["Air conditioned", "Card & UPI", "Late evening hours"],
    parking: "Building basement parking.",
    accessibility: "Lift access.",
    hours: [{ days: ALL_WEEK, shifts: [[H(10), H(14)], [H(16), H(22)]] }],
    resources: [["Haircut Chair", "Hair Zone", 4], ["Facial Bed", "Skin Zone", 1], ["Manicure Station", "Nail Zone", 1]],
    services: ["haircut-men", "haircut-women", "beard-trim", "hair-styling", "hair-spa", "facial", "cleanup", "threading", "manicure"],
    priceFactor: 0.9,
    busy: 10,
    staff: [
      { name: "Aravind", title: "Stylist", spec: "Men's cuts", exp: 6, skills: ["haircut-men", "beard-trim", "hair-spa", "hair-styling"], days: ALL_WEEK, start: H(10), end: H(22), brk: [H(14), H(16)] },
      { name: "Monisha", title: "Stylist", spec: "Women's styling", exp: 5, skills: ["haircut-women", "hair-styling", "threading", "hair-spa"], days: [1, 2, 3, 4, 5, 6], start: H(16), end: H(22) },
      { name: "Yamini", title: "Beautician", spec: "Facials", exp: 4, skills: ["facial", "cleanup", "threading", "manicure"], days: [0, 2, 3, 4, 5, 6], start: H(10), end: H(22), brk: [H(14), H(16)] },
    ],
  },
  {
    name: "Royal Looks",
    area: "Indiranagar",
    tagline: "Bengaluru's bridal & occasion experts.",
    gender: "UNISEX",
    color: "#9333ea",
    owner: "owner9@example.com",
    rating: 4.6,
    plan: "PREMIUM",
    amenities: ["Air conditioned", "Bridal suite", "Card & UPI", "Wi-Fi", "Champagne for brides"],
    parking: "Paid parking on 100 Feet Road.",
    accessibility: "Ground floor.",
    hours: [{ days: ALL_WEEK, shifts: [[H(9), H(21)]] }],
    resources: [["Haircut Chair", "Styling Floor", 4], ["Facial Bed", "Skin Room", 2], ["Makeup Room", "Bridal Suites", 2], ["Manicure Station", "Nail Bar", 2]],
    services: ["haircut-women", "haircut-men", "hair-styling", "hair-color", "keratin", "facial", "skin-care", "manicure", "nail-art", "makeup", "party-makeup", "bridal"],
    priceFactor: 1.35,
    busy: 9,
    policy: { refundType: "TRANSFERABLE", maxReschedules: 3, rescheduleMinHours: 24 },
    staff: [
      { name: "Shruti Hegde", title: "Lead Makeup Artist", spec: "Bridal", exp: 11, skills: ["bridal", "party-makeup", "makeup"], days: ALL_WEEK, start: H(9), end: H(19), brk: [H(14), H(14, 30)] },
      { name: "Kavya Gowda", title: "Hair Stylist", spec: "Bridal hair", exp: 7, skills: ["bridal", "hair-styling", "haircut-women", "hair-color", "keratin"], days: ALL_WEEK, start: H(10), end: H(20), brk: [H(15), H(15, 30)] },
      { name: "Nikhil Rao", title: "Stylist", spec: "Men's styling", exp: 5, skills: ["haircut-men", "hair-styling", "hair-color"], days: [1, 2, 3, 4, 5, 6], start: H(11), end: H(21), brk: [H(16), H(16, 30)] },
      { name: "Ayesha Siddiqui", title: "Makeup Artist", spec: "HD & airbrush", exp: 6, skills: ["bridal", "party-makeup", "makeup", "facial", "skin-care"], days: [0, 2, 3, 4, 5, 6], start: H(10), end: H(21), brk: [H(14, 30), H(15)] },
      { name: "Pooja Shetty", title: "Nail Artist", spec: "Gel extensions", exp: 4, skills: ["manicure", "nail-art", "facial"], days: [0, 1, 3, 4, 5, 6], start: H(11), end: H(20), brk: [H(15), H(15, 30)] },
    ],
  },
  {
    name: "Fresh Trim",
    area: "Koramangala",
    tagline: "Quick, clean, affordable.",
    gender: "MEN",
    color: "#16a34a",
    owner: "owner10@example.com",
    rating: 4.0,
    plan: "FREE",
    amenities: ["Air conditioned", "UPI accepted", "Kids friendly"],
    parking: "Street parking.",
    accessibility: "Ground floor.",
    hours: [{ days: ALL_WEEK, shifts: [[H(8, 30), H(21)]] }],
    resources: [["Haircut Chair", "Barber Floor", 4]],
    services: ["haircut-men", "kids-haircut", "beard-trim", "shave", "head-massage", "hair-spa"],
    priceFactor: 0.8,
    busy: 13,
    staff: [
      { name: "Raju", title: "Barber", spec: "Fast fades", exp: 7, skills: ["haircut-men", "kids-haircut", "beard-trim", "shave"], days: ALL_WEEK, start: H(8, 30), end: H(16, 30), brk: [H(12, 30), H(13)] },
      { name: "Mahesh", title: "Barber", spec: "Classic", exp: 5, skills: ["haircut-men", "beard-trim", "shave", "head-massage", "hair-spa"], days: [1, 2, 3, 4, 5, 6], start: H(13), end: H(21), brk: [H(17), H(17, 30)] },
      { name: "Santosh", title: "Barber", spec: "Kids", exp: 3, skills: ["haircut-men", "kids-haircut", "beard-trim", "head-massage"], days: [0, 2, 3, 4, 5, 6], start: H(10), end: H(19), brk: [H(14), H(14, 30)] },
    ],
  },
  {
    name: "Velvet Touch Studio",
    area: "Porur",
    tagline: "Opening soon — premium unisex salon.",
    gender: "UNISEX",
    color: "#e11d48",
    owner: "owner11@example.com",
    rating: 0,
    plan: "FREE",
    status: "PENDING",
    amenities: ["Air conditioned"],
    parking: "Basement parking.",
    accessibility: "Lift access.",
    hours: [{ days: ALL_WEEK, shifts: [[H(10), H(20)]] }],
    resources: [["Haircut Chair", "Hair Area", 3]],
    services: ["haircut-men", "haircut-women", "beard-trim"],
    priceFactor: 1,
    busy: 0,
    staff: [{ name: "Ramya", title: "Stylist", spec: "All-rounder", exp: 4, skills: ["haircut-men", "haircut-women", "beard-trim"], days: ALL_WEEK, start: H(10), end: H(20) }],
  },
];

const CUSTOMER_NAMES = [
  "Rahul Verma", "Ananya Iyer", "Karthik Subramanian", "Divya Menon", "Arjun Nair", "Sneha Reddy", "Vikram Singh", "Meera Krishnan",
  "Rohan Gupta", "Lakshmi Narayanan", "Aditya Rao", "Kavya Pillai", "Siddharth Jain", "Nisha Patel", "Harish Kumar", "Pooja Desai",
  "Manoj Bhat", "Deepa Raman", "Sanjay Mehta", "Aishwarya Natarajan", "Naveen Chandra", "Swathi Venkat", "Gautam Shetty", "Ritu Agarwal",
];
const WALKIN_FIRST = ["Ravi", "Suresh", "Prakash", "Ajith", "Vijay", "Ramesh", "Kumar", "Selvam", "Bharath", "Hari", "Latha", "Geetha", "Kala", "Uma", "Saranya", "Mohan", "Balaji", "Ashok", "Rekha", "Nithya"];
const REVIEW_TEXT: Record<number, string[]> = {
  5: ["Absolutely loved it! Best haircut I've had in years.", "Super professional and on time. Booking through the app was seamless.", "Amazing experience, very hygienic and friendly staff.", "Worth every rupee. Will definitely come back.", "Exactly the look I asked for. Highly recommend!"],
  4: ["Great service, slight wait but worth it.", "Good ambience and skilled stylist. Parking is a bit tricky.", "Very good, pricing is fair.", "Nice experience overall, would visit again."],
  3: ["Decent service but had to wait 15 minutes past my slot.", "Okay experience. Could be more attentive to detail.", "Average — nothing special."],
  2: ["Not happy with the cut, had to get it fixed.", "Waited too long despite booking."],
  1: ["Very disappointing experience."],
};

/* ------------------------------------------------------------------ main */
async function main() {
  console.log("→ resetting database");
  const tables = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'`);
  if (tables.rows.length) {
    await db.execute(sql.raw(`truncate ${tables.rows.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`));
  }

  await db.insert(s.platformSettings).values({ key: "config", value: DEFAULT_PLATFORM_CONFIG });
  const cats = await db.insert(s.serviceCategories).values(CATEGORIES.map(([slug, name, icon], i) => ({ slug, name, icon, sort: i }))).returning();
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
  await db.insert(s.areas).values(AREAS.map(([name, city, lat, lng]) => ({ name, city, lat, lng })));

  console.log("→ users");
  const pw = await hashPassword(DEMO_PASSWORD);
  const mkUser = async (email: string, name: string, role: "CUSTOMER" | "OWNER" | "STAFF" | "ADMIN", phone?: string) => {
    const [u] = await db.insert(s.users).values({ email, name, role, phone: phone ?? `9${String(Math.floor(rand() * 1e9)).padStart(9, "0")}`, passwordHash: pw }).returning();
    if (role === "CUSTOMER") await db.insert(s.customerProfiles).values({ userId: u!.id, savedLocations: [{ label: "Home", lat: 13.0418, lng: 80.2341, address: "T. Nagar, Chennai" }] });
    return u!;
  };
  await mkUser("admin@example.com", "Platform Admin", "ADMIN", "9000000001");
  const demoCustomer = await mkUser("customer@example.com", "Priya Sharma", "CUSTOMER", "9876543210");
  const customers = [demoCustomer];
  for (const [i, n] of CUSTOMER_NAMES.entries()) customers.push(await mkUser(`customer${i + 2}@example.com`, n, "CUSTOMER"));
  const owners = new Map<string, typeof demoCustomer>();
  const ownerNames: Record<string, string> = { "owner@example.com": "Sathish Kumar" };
  for (const t of SALONS) {
    if (!owners.has(t.owner)) owners.set(t.owner, await mkUser(t.owner, ownerNames[t.owner] ?? `${t.name} Owner`, "OWNER"));
  }

  console.log("→ salons, resources, staff, services");
  const salonIds: string[] = [];
  for (const [si, t] of SALONS.entries()) {
    const area = AREAS.find((a) => a[0] === t.area)!;
    const city = area[1];
    const jitter = () => (rand() - 0.5) * 0.008;
    const svcTemplates = t.services.map((k) => SERVICES.find((x) => x.key === k)!);
    const price = (p: number) => Math.round((p * t.priceFactor) / 10) * 10;
    const [salon] = await db
      .insert(s.salons)
      .values({
        ownerId: owners.get(t.owner)!.id,
        name: t.name,
        slug: t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        citySlug: city.toLowerCase(),
        tagline: t.tagline,
        description: `${t.name} is a ${t.gender === "UNISEX" ? "unisex" : t.gender === "MEN" ? "men's" : "women's"} salon in ${t.area}, ${city}. ${t.tagline} Our team of ${t.staff.length} trained professionals uses premium, skin-safe products and follows strict hygiene protocols — every tool is sanitised between clients.`,
        phone: `+91 44 ${String(2400_0000 + si * 1111).slice(0, 4)} ${String(1000 + si * 37).slice(0, 4)}`,
        email: `hello@${t.name.toLowerCase().replace(/[^a-z]/g, "")}.in`,
        brandColor: t.color,
        genderType: t.gender,
        amenities: t.amenities,
        parkingInfo: t.parking,
        accessibilityInfo: t.accessibility,
        status: t.status ?? "APPROVED",
        onboardingStep: t.status === "PENDING" ? 10 : 11,
        startingPrice: Math.min(...svcTemplates.map((x) => rupees(price(x.price)))),
        plan: t.plan,
        featured: !!t.featured,
        payoutDetails: { accountName: t.name, accountNumberLast4: String(1000 + si * 7).slice(-4), ifsc: "HDFC0001234", upiId: `${t.name.toLowerCase().replace(/[^a-z]/g, "")}@okhdfc` },
      })
      .returning();
    salonIds.push(salon!.id);
    await db.insert(s.salonLocations).values({
      salonId: salon!.id,
      addressLine: `${10 + si * 7}, ${["Main Road", "2nd Avenue", "Gandhi Street", "1st Cross", "High Street"][si % 5]}`,
      area: t.area,
      city,
      state: city === "Chennai" ? "Tamil Nadu" : "Karnataka",
      pincode: city === "Chennai" ? `6000${String(10 + si).padStart(2, "0")}` : `5600${String(30 + si).padStart(2, "0")}`,
      lat: area[2] + jitter(),
      lng: area[3] + jitter(),
    });
    await db.insert(s.salonImages).values([0, 1, 2, 3].map((n) => ({ salonId: salon!.id, url: `gen:${salon!.id}:${n}`, caption: ["Reception", "Styling floor", "Treatment room", "Products"][n], sort: n })));
    await db.insert(s.salonPolicies).values({
      salonId: salon!.id,
      policyText: "Please arrive 5 minutes before your slot. Late arrivals are served when a seat and stylist become free.",
      ...t.policy,
    });
    for (const h of t.hours) for (const d of h.days) for (const [o, c] of h.shifts) await db.insert(s.businessHours).values({ salonId: salon!.id, weekday: d, openMinute: o, closeMinute: c });

    const typeIds: Record<string, string> = {};
    for (const [typeName, areaName, cnt] of t.resources) {
      const [rt] = await db.insert(s.resourceTypes).values({ salonId: salon!.id, name: typeName, area: areaName }).returning();
      typeIds[typeName] = rt!.id;
      const short = typeName.replace(/^(Haircut |Facial |Manicure |Pedicure |Spa |Makeup )/, "");
      await db.insert(s.resources).values(Array.from({ length: cnt }, (_, i) => ({ salonId: salon!.id, resourceTypeId: rt!.id, name: `${short} ${i + 1}`, sort: i })));
    }

    const svcIds: Record<string, string> = {};
    for (const [i, x] of svcTemplates.entries()) {
      if (!x.res.every(([rt]) => typeIds[rt])) continue;
      const [svc] = await db
        .insert(s.services)
        .values({
          salonId: salon!.id,
          categoryId: catId[x.cat],
          name: x.name,
          description: x.desc,
          price: rupees(price(x.price)),
          durationMinutes: x.dur,
          prepMinutes: x.prep ?? 0,
          bufferMinutes: x.buffer ?? 0,
          staffRequired: x.staff ?? 1,
          gender: x.gender ?? "UNISEX",
          sort: i,
        })
        .returning();
      svcIds[x.key] = svc!.id;
      await db.insert(s.serviceResourceRequirements).values(x.res.map(([rt, q]) => ({ serviceId: svc!.id, resourceTypeId: typeIds[rt]!, quantity: q })));
      for (const [gi, g] of (x.groups ?? []).entries()) {
        const [grp] = await db.insert(s.serviceOptionGroups).values({ serviceId: svc!.id, name: g.name, multiSelect: !!g.multi, required: !!g.required, sort: gi }).returning();
        await db.insert(s.serviceOptions).values(g.options.map(([n, p, m], oi) => ({ groupId: grp!.id, name: n, priceDelta: rupees(price(p)), durationDelta: m, sort: oi })));
      }
    }

    for (const st of t.staff) {
      const login = st.login ? await mkUser(st.login, st.name, "STAFF", "9123456780") : null;
      const [row] = await db
        .insert(s.staff)
        .values({
          salonId: salon!.id,
          userId: login?.id,
          name: st.name,
          title: st.title,
          specialization: st.spec,
          experienceYears: st.exp,
          phone: `9${String(Math.floor(rand() * 1e9)).padStart(9, "0")}`,
          bio: `${st.title} with ${st.exp} years of experience. Known for ${st.spec.toLowerCase()}.`,
          permissions: login ? ["CHECK_IN", "WALK_IN", "MANAGE_BOOKINGS", "VIEW_CUSTOMERS"] : ["CHECK_IN", "WALK_IN"],
        })
        .returning();
      const skills = st.skills.filter((k) => svcIds[k]);
      if (skills.length) await db.insert(s.staffServices).values(skills.map((k) => ({ staffId: row!.id, serviceId: svcIds[k]! })));
      for (const d of st.days ?? ALL_WEEK) {
        await db.insert(s.staffSchedules).values({ staffId: row!.id, weekday: d, startMinute: st.start ?? H(10), endMinute: st.end ?? H(20) });
        if (st.brk) await db.insert(s.staffBreaks).values({ staffId: row!.id, weekday: d, startMinute: st.brk[0], endMinute: st.brk[1], label: "Lunch break" });
      }
    }

    // offers
    const now = new Date();
    const in30 = new Date(Date.now() + 30 * 86400_000);
    const offerRows: (typeof s.coupons.$inferInsert)[] = [];
    if (si % 2 === 0) offerRows.push({ salonId: salon!.id, code: "GROOM20", title: "20% OFF on all services", type: "PERCENT", value: 20, maxDiscount: rupees(300), validFrom: new Date(Date.now() - 5 * 86400_000), validTo: in30, kind: "GENERAL", usageLimit: 500, perUserLimit: 2 });
    if (svcIds["hair-spa"]) offerRows.push({ salonId: salon!.id, code: "SPA20", title: "20% OFF Hair Spa (11 AM – 2 PM)", description: "Weekday lunch-hour special", type: "PERCENT", value: 20, validFrom: now, validTo: in30, startMinute: H(11), endMinute: H(14), serviceIds: [svcIds["hair-spa"]], kind: "TIME" });
    if (si % 3 === 1) offerRows.push({ salonId: salon!.id, code: "FIRST100", title: "₹100 OFF your first visit", type: "FLAT", value: rupees(100), minAmount: rupees(400), validFrom: now, validTo: in30, newCustomerOnly: true, kind: "NEW_CUSTOMER" });
    if (si % 3 === 2) offerRows.push({ salonId: salon!.id, code: "WEEKEND15", title: "Weekend 15% OFF", type: "PERCENT", value: 15, maxDiscount: rupees(500), validFrom: now, validTo: in30, weekdays: [0, 6], kind: "WEEKEND" });
    if (offerRows.length) await db.insert(s.coupons).values(offerRows);
  }
  await db.insert(s.coupons).values({ salonId: null, code: "WELCOME50", title: "₹50 OFF your first BookMyStyle booking", type: "FLAT", value: rupees(50), minAmount: rupees(200), validFrom: new Date(Date.now() - 86400_000), validTo: new Date(Date.now() + 90 * 86400_000), firstBookingOnly: true, kind: "FIRST_BOOKING" });

  // holidays / special days / leave / maintenance
  const classic = salonIds[6]!;
  await db.insert(s.holidays).values({ salonId: classic, date: addDaysKey(today, 17), isClosed: true, reason: "Ayudha Pooja" });
  await db.insert(s.holidays).values({ salonId: salonIds[1]!, date: addDaysKey(today, 5), isClosed: false, openMinute: H(8), closeMinute: H(22), reason: "Festival extended hours" });
  const styleHubChair6 = await db.query.resources.findFirst({ where: (r, { and, eq }) => and(eq(r.salonId, salonIds[2]!), eq(r.name, "Chair 6")) });
  if (styleHubChair6) await db.insert(s.resourceBlocks).values({ salonId: salonIds[2]!, resourceId: styleHubChair6.id, startsAt: zonedToUtc(today, H(14), TZ), endsAt: zonedToUtc(today, H(17), TZ), reason: "Hydraulic repair" });
  const karthik = await db.query.staff.findFirst({ where: (r, { eq }) => eq(r.name, "Karthik Raja") });
  if (karthik) await db.insert(s.staffLeaves).values({ staffId: karthik.id, startsAt: zonedToUtc(addDaysKey(today, 2), 0, TZ), endsAt: zonedToUtc(addDaysKey(today, 3), 0, TZ), reason: "Family function" });

  console.log("→ bookings (allocated through the availability engine)");
  let total = 0;
  const nowMs = Date.now();
  for (const [si, t] of SALONS.entries()) {
    if (!t.busy) continue;
    const salonId = salonIds[si]!;
    const svcRows = await db.query.services.findMany({ where: eq(s.services.salonId, salonId) });
    const groups = await db.query.serviceOptionGroups.findMany();
    const opts = await db.query.serviceOptions.findMany();
    for (let d = -60; d <= 7; d++) {
      const date = addDaysKey(today, d);
      const { ctx, toInstant } = await loadDayContext(db, salonId, date, { allowUnapproved: true });
      if (!ctx.open.length) continue;
      const weekend = [0, 6].includes(weekdayOf(date));
      const target = Math.round(t.busy * (weekend ? 1.3 : 1) * (d > 0 ? 0.35 + 0.1 * (7 - d) / 7 : d === 0 ? 0.9 : 0.75 + rand() * 0.4));
      const rows: (typeof s.bookings.$inferInsert & { _res: string[]; _staff: string[]; _items: (typeof s.bookingItems.$inferInsert)[]; _w: Interval })[] = [];
      for (let attempt = 0; attempt < target * 4 && rows.length < target; attempt++) {
        const svc = pick(svcRows.filter((x) => (x.price < rupees(4000) ? true : chance(0.15))));
        const myGroups = groups.filter((g) => g.serviceId === svc.id);
        const optionIds = myGroups.flatMap((g) => {
          const o = opts.filter((x) => x.groupId === g.id);
          return g.required || chance(0.3) ? [pick(o).id] : [];
        });
        let sel;
        try {
          sel = await loadServiceSelection(db, salonId, svc.id, optionIds);
        } catch {
          continue;
        }
        const open = pick(ctx.open);
        const span = (open.end - open.start) / 60_000 - sel.spec.durationMinutes;
        if (span <= 0) continue;
        const startMinOffset = Math.floor((rand() * span) / 15) * 15;
        const openMin = Math.round((open.start - toInstant(0)) / 60_000);
        const startsAt = toInstant(openMin + startMinOffset);
        const ev = evaluateSlot(ctx, sel.spec, startsAt, { now: nowMs, ignoreAdvanceRules: true });
        if (!ev.available) continue;
        // reserve in the in-memory context so later picks respect it
        const w = { start: ev.occupiedFrom, end: ev.occupiedUntil };
        ev.resourceIds.forEach((r) => ctx.resourceBusy.set(r, [...(ctx.resourceBusy.get(r) ?? []), w]));
        ev.staffIds.forEach((r) => ctx.staffBusy.set(r, [...(ctx.staffBusy.get(r) ?? []), w]));

        const online = chance(0.62);
        const cust = online ? pick(customers.slice(1)) : null;
        const subtotal = sel.service.price + sel.options.reduce((a, o) => a + o.priceDelta, 0);
        const q = computeQuote(subtotal, 0, 18);
        const past = ev.endsAt < nowMs;
        const inProgress = ev.startsAt <= nowMs && ev.endsAt > nowMs;
        let status: (typeof s.bookingStatus.enumValues)[number] = "CONFIRMED";
        if (past) status = online ? (chance(0.88) ? "COMPLETED" : chance(0.6) ? "CANCELLED" : "NO_SHOW") : "COMPLETED";
        else if (inProgress) status = "IN_SERVICE";
        else if (d === 0 && ev.startsAt - nowMs < 20 * 60_000) status = chance(0.5) ? "CHECKED_IN" : "CONFIRMED";
        const released = status === "CANCELLED" || status === "NO_SHOW";
        const walkName = `${pick(WALKIN_FIRST)} ${pick(["K", "S", "R", "M", "P", "V"])}`;
        rows.push({
          code: bookingCode(date),
          salonId,
          customerId: cust?.id ?? null,
          customerName: cust?.name ?? walkName,
          customerPhone: cust?.phone ?? `9${String(Math.floor(rand() * 1e9)).padStart(9, "0")}`,
          serviceId: svc.id,
          source: online ? "ONLINE" : chance(0.85) ? "WALK_IN" : "OWNER",
          status,
          startsAt: new Date(ev.startsAt),
          endsAt: new Date(ev.endsAt),
          occupiedFrom: new Date(ev.occupiedFrom),
          occupiedUntil: new Date(ev.occupiedUntil),
          durationMinutes: sel.spec.durationMinutes,
          subtotal: q.subtotal,
          tax: q.tax,
          total: q.total,
          paymentStatus: online ? (status === "CANCELLED" ? "REFUNDED" : "SUCCESSFUL") : past || inProgress ? "SUCCESSFUL" : "PENDING",
          paymentMode: online ? "ONLINE" : pick(["CASH", "UPI", "UPI", "CARD"] as const),
          checkInToken: randomBytes(12).toString("base64url"),
          checkedInAt: ["COMPLETED", "IN_SERVICE", "CHECKED_IN"].includes(status) ? new Date(ev.startsAt - 5 * 60_000) : null,
          serviceStartedAt: ["COMPLETED", "IN_SERVICE"].includes(status) ? new Date(ev.startsAt) : null,
          completedAt: status === "COMPLETED" ? new Date(ev.endsAt) : null,
          cancelledAt: status === "CANCELLED" ? new Date(ev.startsAt - 26 * 3_600_000) : null,
          cancelReason: status === "CANCELLED" ? "Change of plans" : null,
          createdAt: new Date(ev.startsAt - (online ? (1 + rand() * 72) * 3_600_000 : 10 * 60_000)),
          _res: released ? [] : ev.resourceIds,
          _staff: released ? [] : ev.staffIds,
          _w: w,
          _items: [
            { bookingId: "", kind: "SERVICE", name: sel.service.name, price: sel.service.price, durationMinutes: sel.service.durationMinutes, serviceId: sel.service.id },
            ...sel.options.map((o) => ({ bookingId: "", kind: "OPTION", name: o.name, groupName: o.groupName, price: o.priceDelta, durationMinutes: o.durationDelta, optionId: o.id })),
          ],
        });
        if (released) {
          // released bookings don't hold capacity
          ev.resourceIds.forEach((r) => ctx.resourceBusy.set(r, ctx.resourceBusy.get(r)!.filter((x) => x !== w)));
          ev.staffIds.forEach((r) => ctx.staffBusy.set(r, ctx.staffBusy.get(r)!.filter((x) => x !== w)));
        }
      }
      if (!rows.length) continue;
      const inserted = await db.insert(s.bookings).values(rows.map(({ _res, _staff, _items, _w, ...b }) => b)).returning({ id: s.bookings.id });
      const resRows: (typeof s.bookingResources.$inferInsert)[] = [];
      const staffRows: (typeof s.bookingStaff.$inferInsert)[] = [];
      const itemRows: (typeof s.bookingItems.$inferInsert)[] = [];
      const histRows: (typeof s.bookingStatusHistory.$inferInsert)[] = [];
      const payRows: (typeof s.payments.$inferInsert)[] = [];
      inserted.forEach(({ id }, i) => {
        const b = rows[i]!;
        b._res.forEach((r) => resRows.push({ bookingId: id, salonId, resourceId: r, startsAt: new Date(b._w.start), endsAt: new Date(b._w.end) }));
        b._staff.forEach((r) => staffRows.push({ bookingId: id, salonId, staffId: r, startsAt: new Date(b._w.start), endsAt: new Date(b._w.end) }));
        b._items.forEach((it) => itemRows.push({ ...it, bookingId: id }));
        histRows.push({ bookingId: id, fromStatus: null, toStatus: b.source === "ONLINE" ? "CONFIRMED" : "CHECKED_IN", note: b.source === "ONLINE" ? "Payment verified" : "Walk-in added at the desk", createdAt: b.createdAt });
        if (b.status !== "CONFIRMED" && b.status !== "CHECKED_IN") histRows.push({ bookingId: id, fromStatus: "CONFIRMED", toStatus: b.status!, createdAt: b.completedAt ?? b.cancelledAt ?? b.startsAt });
        if (b.paymentStatus === "SUCCESSFUL" || b.paymentStatus === "REFUNDED") {
          payRows.push({ bookingId: id, provider: b.source === "ONLINE" ? "sandbox" : "offline", providerOrderId: b.source === "ONLINE" ? `order_seed_${id.slice(0, 18)}` : null, providerPaymentId: b.source === "ONLINE" ? `pay_seed_${id.slice(0, 18)}` : null, amount: b.total, status: b.paymentStatus, method: b.source === "ONLINE" ? pick(["upi", "upi", "card", "netbanking", "wallet"]) : b.paymentMode!.toLowerCase(), verifiedAt: b.createdAt, createdAt: b.createdAt });
        }
      });
      if (resRows.length) await db.insert(s.bookingResources).values(resRows);
      if (staffRows.length) await db.insert(s.bookingStaff).values(staffRows);
      await db.insert(s.bookingItems).values(itemRows);
      await db.insert(s.bookingStatusHistory).values(histRows);
      if (payRows.length) await db.insert(s.payments).values(payRows);
      total += rows.length;
    }
  }
  console.log(`  ${total} bookings`);

  console.log("→ reviews & ratings");
  const completed = await db.execute<{ id: string; salon_id: string; customer_id: string; service_id: string; staff_id: string | null; completed_at: Date }>(sql`
    select b.id, b.salon_id, b.customer_id, b.service_id, b.completed_at,
      (select bs.staff_id from booking_staff bs where bs.booking_id = b.id limit 1) as staff_id
    from bookings b where b.status = 'COMPLETED' and b.customer_id is not null and b.customer_id <> ${demoCustomer.id}`);
  const reviewRows: (typeof s.reviews.$inferInsert)[] = [];
  for (const b of completed.rows) {
    if (!chance(0.55)) continue;
    const t = SALONS[salonIds.indexOf(b.salon_id)]!;
    const r = Math.max(1, Math.min(5, Math.round(t.rating + (rand() - 0.5) * 1.6 + (rand() < 0.08 ? -2 : 0))));
    reviewRows.push({
      bookingId: b.id,
      salonId: b.salon_id,
      customerId: b.customer_id,
      serviceId: b.service_id,
      staffId: b.staff_id,
      rating: r,
      serviceRating: r,
      staffRating: Math.max(1, Math.min(5, r + (chance(0.3) ? 1 : 0))),
      comment: chance(0.8) ? pick(REVIEW_TEXT[r]!) : null,
      ownerReply: chance(0.25) ? (r >= 4 ? "Thank you so much! See you again soon 🙏" : "Sorry about this — we've shared your feedback with the team and would love to make it right on your next visit.") : null,
      repliedAt: null,
      createdAt: new Date(new Date(b.completed_at).getTime() + 3 * 3_600_000),
    });
  }
  for (let i = 0; i < reviewRows.length; i += 500) await db.insert(s.reviews).values(reviewRows.slice(i, i + 500));
  await db.execute(sql`update salons s set rating_avg = round(x.avg::numeric, 1), rating_count = x.n from (select salon_id, avg(rating) avg, count(*) n from reviews group by salon_id) x where x.salon_id = s.id`);
  await db.execute(sql`update staff st set rating_avg = round(x.avg::numeric, 1), rating_count = x.n from (select staff_id, avg(coalesce(staff_rating, rating)) avg, count(*) n from reviews where staff_id is not null group by staff_id) x where x.staff_id = st.id`);
  await db.execute(sql`update coupons c set used_count = (select count(*) from coupon_usage u where u.coupon_id = c.id)`);

  console.log("→ demo customer journey");
  await seedDemoCustomer(demoCustomer.id, salonIds);

  console.log(`\n✓ Seed complete. Demo password for all accounts: ${DEMO_PASSWORD}`);
  console.log("  customer@example.com · owner@example.com · staff@example.com · admin@example.com");
}

async function seedDemoCustomer(userId: string, salonIds: string[]) {
  const urbanCuts = salonIds[0]!;
  const glow = salonIds[1]!;
  await db.insert(s.favorites).values([{ userId, salonId: urbanCuts }, { userId, salonId: glow }, { userId, salonId: salonIds[3]! }]);
  const mk = async (salonId: string, svcName: string, date: string, minute: number, status: "CONFIRMED" | "COMPLETED" | "CANCELLED") => {
    const svc = await db.query.services.findFirst({ where: (x, { and, eq }) => and(eq(x.salonId, salonId), eq(x.name, svcName)) });
    if (!svc) return null;
    const groups = await db.query.serviceOptionGroups.findMany({ where: eq(s.serviceOptionGroups.serviceId, svc.id) });
    const optionIds: string[] = [];
    for (const g of groups.filter((x) => x.required)) {
      const o = await db.query.serviceOptions.findFirst({ where: eq(s.serviceOptions.groupId, g.id) });
      if (o) optionIds.push(o.id);
    }
    const sel = await loadServiceSelection(db, salonId, svc.id, optionIds);
    const { ctx, toInstant } = await loadDayContext(db, salonId, date, { allowUnapproved: true });
    for (let m = minute; m < minute + 240; m += 15) {
      const ev = evaluateSlot(ctx, sel.spec, toInstant(m), { now: Date.now(), ignoreAdvanceRules: true });
      if (!ev.available) continue;
      const subtotal = sel.service.price + sel.options.reduce((a, o) => a + o.priceDelta, 0);
      const q = computeQuote(subtotal, 0, 18);
      const [b] = await db
        .insert(s.bookings)
        .values({
          code: bookingCode(date, 4821),
          salonId,
          customerId: userId,
          customerName: "Priya Sharma",
          customerPhone: "9876543210",
          serviceId: svc.id,
          source: "ONLINE",
          status,
          startsAt: new Date(ev.startsAt),
          endsAt: new Date(ev.endsAt),
          occupiedFrom: new Date(ev.occupiedFrom),
          occupiedUntil: new Date(ev.occupiedUntil),
          durationMinutes: sel.spec.durationMinutes,
          subtotal: q.subtotal,
          tax: q.tax,
          total: q.total,
          paymentStatus: status === "CANCELLED" ? "REFUNDED" : "SUCCESSFUL",
          paymentMode: "ONLINE",
          requirements: status === "CONFIRMED" ? "Please keep the sides short." : null,
          checkInToken: randomBytes(16).toString("base64url"),
          completedAt: status === "COMPLETED" ? new Date(ev.endsAt) : null,
          checkedInAt: status === "COMPLETED" ? new Date(ev.startsAt) : null,
          serviceStartedAt: status === "COMPLETED" ? new Date(ev.startsAt) : null,
          cancelledAt: status === "CANCELLED" ? new Date(ev.startsAt - 48 * 3_600_000) : null,
          cancelReason: status === "CANCELLED" ? "Cancelled by customer" : null,
          createdAt: new Date(ev.startsAt - 72 * 3_600_000),
        })
        .returning();
      await db.insert(s.bookingItems).values([
        { bookingId: b!.id, kind: "SERVICE", name: sel.service.name, price: sel.service.price, durationMinutes: sel.service.durationMinutes, serviceId: sel.service.id },
        ...sel.options.map((o) => ({ bookingId: b!.id, kind: "OPTION", name: o.name, groupName: o.groupName, price: o.priceDelta, durationMinutes: o.durationDelta, optionId: o.id })),
      ]);
      if (status !== "CANCELLED") {
        await db.insert(s.bookingResources).values(ev.resourceIds.map((r) => ({ bookingId: b!.id, salonId, resourceId: r, startsAt: new Date(ev.occupiedFrom), endsAt: new Date(ev.occupiedUntil) })));
        await db.insert(s.bookingStaff).values(ev.staffIds.map((r) => ({ bookingId: b!.id, salonId, staffId: r, startsAt: new Date(ev.occupiedFrom), endsAt: new Date(ev.occupiedUntil) })));
      }
      const [p] = await db.insert(s.payments).values({ bookingId: b!.id, provider: "sandbox", providerOrderId: `order_seed_demo_${b!.id.slice(0, 8)}`, providerPaymentId: `pay_seed_demo_${b!.id.slice(0, 8)}`, amount: q.total, status: status === "CANCELLED" ? "REFUNDED" : "SUCCESSFUL", method: "upi", verifiedAt: b!.createdAt }).returning();
      if (status === "CANCELLED") await db.insert(s.refunds).values({ paymentId: p!.id, bookingId: b!.id, amount: q.total, status: "PROCESSED", reason: "Full refund for cancelling at least 24 hours before the appointment.", providerRefundId: "rfnd_seed_demo", processedAt: b!.cancelledAt });
      await db.insert(s.bookingStatusHistory).values([
        { bookingId: b!.id, fromStatus: null, toStatus: "PAYMENT_PENDING", createdAt: b!.createdAt },
        { bookingId: b!.id, fromStatus: "PAYMENT_PENDING", toStatus: "CONFIRMED", note: "Payment verified (upi)", createdAt: b!.createdAt },
        ...(status !== "CONFIRMED" ? [{ bookingId: b!.id, fromStatus: "CONFIRMED" as const, toStatus: status, createdAt: b!.completedAt ?? b!.cancelledAt! }] : []),
      ]);
      return b!;
    }
    return null;
  };
  const upcoming = await mk(urbanCuts, "Premium Haircut", addDaysKey(today, 1), H(17), "CONFIRMED");
  await mk(glow, "Signature Facial", addDaysKey(today, 4), H(11), "CONFIRMED");
  const past = await mk(glow, "Hair Spa", addDaysKey(today, -6), H(12), "COMPLETED");
  await mk(salonIds[3]!, "Premium Haircut", addDaysKey(today, -20), H(16), "COMPLETED");
  await mk(urbanCuts, "Haircut", addDaysKey(today, -12), H(18), "CANCELLED");

  const notes: (typeof s.notifications.$inferInsert)[] = [
    { userId, category: "BOOKING", type: "booking.confirmed", title: "Booking confirmed 🎉", body: `Premium Haircut at Urban Cuts tomorrow. Booking ID ${upcoming?.code}.`, link: upcoming ? `/customer/bookings/${upcoming.id}` : null, externalDeliveredAt: new Date() },
    { userId, category: "OFFER", type: "offer", title: "20% OFF Hair Spa this week", body: "Use SPA20 between 11 AM – 2 PM at participating salons.", link: "/search?category=hair-spa&offers=1", externalDeliveredAt: new Date() },
    { userId, category: "BOOKING", type: "review.request", title: "How was your Hair Spa?", body: "Rate your visit to Glow Beauty Studio — it takes 10 seconds.", link: past ? `/customer/bookings/${past.id}` : null, externalDeliveredAt: new Date(), readAt: null },
    { userId, category: "PAYMENT", type: "refund.processed", title: "Refund processed", body: "Your refund for the cancelled Urban Cuts booking has been processed.", readAt: new Date(), externalDeliveredAt: new Date() },
  ];
  await db.insert(s.notifications).values(notes);
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(e);
    await pool.end();
    process.exit(1);
  });
