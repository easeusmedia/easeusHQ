"use client";

import { useState } from "react";
import { NoticesSection, type Notice } from "../home/HomeView";

// The Sales home's notices (Sales alone have no Home): Home's own panel,
// folded and unfolded here, staying where it is
export function SalesNotices({ notices, canForward, people }: { notices: Notice[]; canForward: boolean; people: { id: string; name: string }[] }) {
  const [collapsed, setCollapsed] = useState(false);
  return <NoticesSection notices={notices} canNote={false} canForward={canForward} people={people} onOpen={() => {}} collapsed={collapsed} onCollapse={() => setCollapsed((c) => !c)} />;
}
