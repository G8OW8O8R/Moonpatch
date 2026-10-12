import { RoomPage, roomMetadata } from "@/components/room/RoomPage";

export const generateMetadata = ({ params }: PageProps<"/[lang]/cafe">) => roomMetadata("cafe", params);

export default function Page({ params }: PageProps<"/[lang]/cafe">) {
  return <RoomPage room="cafe" params={params} />;
}
