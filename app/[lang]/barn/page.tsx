import { RoomPage, roomMetadata } from "@/components/room/RoomPage";

export const generateMetadata = ({ params }: PageProps<"/[lang]/barn">) => roomMetadata("barn", params);

export default function Page({ params }: PageProps<"/[lang]/barn">) {
  return <RoomPage room="barn" params={params} />;
}
