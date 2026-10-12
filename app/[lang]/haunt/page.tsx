import { RoomPage, roomMetadata } from "@/components/room/RoomPage";

export const generateMetadata = ({ params }: PageProps<"/[lang]/haunt">) => roomMetadata("haunt", params);

export default function Page({ params }: PageProps<"/[lang]/haunt">) {
  return <RoomPage room="haunt" params={params} />;
}
