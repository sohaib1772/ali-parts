import { createFileRoute } from "@tanstack/react-router";
import { bannersQuery } from "@/lib/queries";
import { OffersPage, offersSearchSchema } from "./offers";

export const Route = createFileRoute("/reels")({
  validateSearch: offersSearchSchema,
  head: () => ({
    meta: [
      { title: "ريلز العروض — Ali Parts" },
      { name: "description", content: "شاهد ريلز العروض الحصرية، اضغط قلب، وشاركنا تعليقك." },
      { property: "og:title", content: "ريلز العروض — Ali Parts" },
      { property: "og:description", content: "شاهد ريلز العروض الحصرية، اضغط قلب، وشاركنا تعليقك." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(bannersQuery());
  },
  component: OffersPage,
});
