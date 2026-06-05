export type GroupId =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L";

export type Team = {
  name: string;
  code: string;
  flag: string;
  group: GroupId;
  colors: [string, string];
};

export type GoldenBootCandidate = {
  name: string;
  country: string;
  flag: string;
};

export const groups: GroupId[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export const teams: Team[] = [
  { group: "A", name: "Mexico", code: "MEX", flag: "🇲🇽", colors: ["#006847", "#ce1126"] },
  { group: "A", name: "South Africa", code: "RSA", flag: "🇿🇦", colors: ["#007a4d", "#ffb81c"] },
  { group: "A", name: "Korea Republic", code: "KOR", flag: "🇰🇷", colors: ["#c60c30", "#003478"] },
  { group: "A", name: "Czechia", code: "CZE", flag: "🇨🇿", colors: ["#d7141a", "#11457e"] },
  { group: "B", name: "Canada", code: "CAN", flag: "🇨🇦", colors: ["#d52b1e", "#ffffff"] },
  { group: "B", name: "Bosnia and Herzegovina", code: "BIH", flag: "🇧🇦", colors: ["#002395", "#fecb00"] },
  { group: "B", name: "Qatar", code: "QAT", flag: "🇶🇦", colors: ["#8a1538", "#ffffff"] },
  { group: "B", name: "Switzerland", code: "SUI", flag: "🇨🇭", colors: ["#ff0000", "#ffffff"] },
  { group: "C", name: "Brazil", code: "BRA", flag: "🇧🇷", colors: ["#009c3b", "#ffdf00"] },
  { group: "C", name: "Morocco", code: "MAR", flag: "🇲🇦", colors: ["#c1272d", "#006233"] },
  { group: "C", name: "Haiti", code: "HAI", flag: "🇭🇹", colors: ["#00209f", "#d21034"] },
  { group: "C", name: "Scotland", code: "SCO", flag: "🇬🇧", colors: ["#005eb8", "#ffffff"] },
  { group: "D", name: "USA", code: "USA", flag: "🇺🇸", colors: ["#0057b8", "#c8102e"] },
  { group: "D", name: "Paraguay", code: "PAR", flag: "🇵🇾", colors: ["#0038a8", "#d52b1e"] },
  { group: "D", name: "Australia", code: "AUS", flag: "🇦🇺", colors: ["#00843d", "#ffcd00"] },
  { group: "D", name: "Türkiye", code: "TUR", flag: "🇹🇷", colors: ["#e30a17", "#ffffff"] },
  { group: "E", name: "Germany", code: "GER", flag: "🇩🇪", colors: ["#000000", "#dd0000"] },
  { group: "E", name: "Curaçao", code: "CUW", flag: "🇨🇼", colors: ["#002b7f", "#f9e814"] },
  { group: "E", name: "Côte d'Ivoire", code: "CIV", flag: "🇨🇮", colors: ["#f77f00", "#009e60"] },
  { group: "E", name: "Ecuador", code: "ECU", flag: "🇪🇨", colors: ["#ffdd00", "#034ea2"] },
  { group: "F", name: "Netherlands", code: "NED", flag: "🇳🇱", colors: ["#ae1c28", "#21468b"] },
  { group: "F", name: "Japan", code: "JPN", flag: "🇯🇵", colors: ["#bc002d", "#ffffff"] },
  { group: "F", name: "Sweden", code: "SWE", flag: "🇸🇪", colors: ["#006aa7", "#fecc00"] },
  { group: "F", name: "Tunisia", code: "TUN", flag: "🇹🇳", colors: ["#e70013", "#ffffff"] },
  { group: "G", name: "Belgium", code: "BEL", flag: "🇧🇪", colors: ["#000000", "#ef3340"] },
  { group: "G", name: "Egypt", code: "EGY", flag: "🇪🇬", colors: ["#ce1126", "#000000"] },
  { group: "G", name: "IR Iran", code: "IRN", flag: "🇮🇷", colors: ["#239f40", "#da0000"] },
  { group: "G", name: "New Zealand", code: "NZL", flag: "🇳🇿", colors: ["#00247d", "#cc142b"] },
  { group: "H", name: "Spain", code: "ESP", flag: "🇪🇸", colors: ["#aa151b", "#f1bf00"] },
  { group: "H", name: "Cabo Verde", code: "CPV", flag: "🇨🇻", colors: ["#003893", "#f7d116"] },
  { group: "H", name: "Saudi Arabia", code: "KSA", flag: "🇸🇦", colors: ["#006c35", "#ffffff"] },
  { group: "H", name: "Uruguay", code: "URU", flag: "🇺🇾", colors: ["#0038a8", "#fcd116"] },
  { group: "I", name: "France", code: "FRA", flag: "🇫🇷", colors: ["#0055a4", "#ef4135"] },
  { group: "I", name: "Senegal", code: "SEN", flag: "🇸🇳", colors: ["#00853f", "#fdef42"] },
  { group: "I", name: "Iraq", code: "IRQ", flag: "🇮🇶", colors: ["#ce1126", "#007a3d"] },
  { group: "I", name: "Norway", code: "NOR", flag: "🇳🇴", colors: ["#ba0c2f", "#00205b"] },
  { group: "J", name: "Argentina", code: "ARG", flag: "🇦🇷", colors: ["#75aadb", "#fcbf49"] },
  { group: "J", name: "Algeria", code: "ALG", flag: "🇩🇿", colors: ["#006233", "#d21034"] },
  { group: "J", name: "Austria", code: "AUT", flag: "🇦🇹", colors: ["#ed2939", "#ffffff"] },
  { group: "J", name: "Jordan", code: "JOR", flag: "🇯🇴", colors: ["#007a3d", "#ce1126"] },
  { group: "K", name: "Portugal", code: "POR", flag: "🇵🇹", colors: ["#006600", "#ff0000"] },
  { group: "K", name: "Colombia", code: "COL", flag: "🇨🇴", colors: ["#fcd116", "#003893"] },
  { group: "K", name: "Uzbekistan", code: "UZB", flag: "🇺🇿", colors: ["#0099b5", "#1eb53a"] },
  { group: "K", name: "Congo DR", code: "COD", flag: "🇨🇩", colors: ["#007fff", "#f7d618"] },
  { group: "L", name: "England", code: "ENG", flag: "🇬🇧", colors: ["#ffffff", "#cf081f"] },
  { group: "L", name: "Croatia", code: "CRO", flag: "🇭🇷", colors: ["#ff0000", "#171796"] },
  { group: "L", name: "Panama", code: "PAN", flag: "🇵🇦", colors: ["#005aa7", "#d21034"] },
  { group: "L", name: "Ghana", code: "GHA", flag: "🇬🇭", colors: ["#ce1126", "#fcd116"] }
];

export const goldenBootCandidates: GoldenBootCandidate[] = [
  { name: "Kylian Mbappe", country: "France", flag: "🇫🇷" },
  { name: "Harry Kane", country: "England", flag: "🇬🇧" },
  { name: "Erling Haaland", country: "Norway", flag: "🇳🇴" },
  { name: "Lionel Messi", country: "Argentina", flag: "🇦🇷" },
  { name: "Cristiano Ronaldo", country: "Portugal", flag: "🇵🇹" },
  { name: "Lamine Yamal", country: "Spain", flag: "🇪🇸" },
  { name: "Vinicius Junior", country: "Brazil", flag: "🇧🇷" },
  { name: "Jude Bellingham", country: "England", flag: "🇬🇧" },
  { name: "Julian Alvarez", country: "Argentina", flag: "🇦🇷" },
  { name: "Lautaro Martinez", country: "Argentina", flag: "🇦🇷" },
  { name: "Raphinha", country: "Brazil", flag: "🇧🇷" },
  { name: "Cody Gakpo", country: "Netherlands", flag: "🇳🇱" },
  { name: "Other / write-in", country: "Manual entry", flag: "✍️" }
];
