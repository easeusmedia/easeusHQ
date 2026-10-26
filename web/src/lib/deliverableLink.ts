import { prisma } from "./prisma";
import { extraName, pickSlot, typesOf } from "./deliverableMatch";

// Tasks and their project's placeholders, kept together (Abhishek, 21 Oct
// 2026): a task takes the placeholder of its kind (and number) in its
// project as soon as it's made or changed, and its name with it (the one it
// was made with kept as originalTitle); with none free, a new one is added
// for it. When it's delivered its final Drive link becomes the placeholder's.
// Internal work, to-dos and work of no deliverable kind are left alone.
// Called after every write that can change any of that; a failure never
// undoes the write itself.
//
// delivering: called as it's delivered or its Drive link is set (a move to
// Delivered, a tick, a saved Drive link). Only then does its link replace
// what the placeholder has (one corrected by hand stays, otherwise).
// oldLink: the Drive link it had before an edit; taken off, it comes off its
// placeholder too
export async function linkDeliverables(taskIds: string[], { delivering = false, oldLink = null as string | null } = {}): Promise<void> {
  for (const id of taskIds) await linkOne(id, delivering, oldLink).catch(() => {});
}

async function linkOne(id: string, delivering: boolean, oldLink: string | null, retry = true): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      title: true,
      originalTitle: true,
      workflow: true,
      status: true,
      driveLink: true,
      internal: true,
      projectId: true,
      deliveryDate: true,
      dueDate: true,
      tags: { select: { name: true } },
      project: { select: { name: true } },
      deliverable: { select: { id: true, link: true } },
    },
  });
  if (!task) return;
  // production work only: internal work and to-dos are never a deliverable
  const types = task.internal || task.workflow === "todo" ? [] : typesOf(task.tags.map((t) => t.name), task.originalTitle ?? task.title);
  const rows = await prisma.projectAsset.findMany({
    where: { projectId: task.projectId },
    select: { id: true, name: true, contentType: true, dueDate: true, sortOrder: true, taskId: true, link: true },
  });
  const slots = rows.map((r) => ({ ...r, due: r.dueDate?.toISOString().slice(0, 10) ?? null }));
  const slot = types.length ? pickSlot({ id, title: task.title, types, driveLink: task.driveLink }, slots) : null;
  const delivered = task.status === "delivered_and_uploaded" && !!task.driveLink;

  // one it no longer fits (moved project, other kind, now internal): let it
  // go, with the link it brought if that's all it has
  const held = task.deliverable;
  if (held && held.id !== slot?.id) {
    await prisma.projectAsset.update({ where: { id: held.id }, data: { taskId: null, ...(held.link && held.link === task.driveLink ? { link: null } : {}) } });
  }

  if (slot) {
    // its link: when it's being delivered, or the placeholder has none yet;
    // the old one off, when it's been taken off the task
    const fill = delivered && (delivering || !slot.link);
    const clear = !task.driveLink && !!oldLink && slot.link === oldLink;
    // claimed only if still free (or already its own): two tasks made at
    // once can't both take it; the loser looks again
    const { count } = await prisma.projectAsset.updateMany({
      where: { id: slot.id, OR: [{ taskId: null }, { taskId: id }] },
      data: { taskId: id, ...(fill ? { link: task.driveLink } : clear ? { link: null } : {}) },
    });
    if (!count && retry) return linkOne(id, delivering, oldLink, false);
    if (count) await takeName(id, task, slot.name);
  } else if (types.length && rows.length && task.project.name) {
    // a project laid out in placeholders, with none of its kind left: one
    // more, as soon as the task is made (Abhishek, 27 Oct 2026; it used to
    // wait for delivery), "Pip Jamieson Reel 7" after six
    const last = rows.reduce((n, r) => Math.max(n, r.sortOrder), -1);
    const name = extraName(task.project.name, types[0], slots);
    await prisma.projectAsset.create({
      data: {
        projectId: task.projectId,
        name,
        contentType: types[0],
        link: delivered ? task.driveLink : null,
        dueDate: task.deliveryDate ?? task.dueDate,
        sortOrder: last + 1,
        taskId: id,
      },
    });
    await takeName(id, task, name);
  } else if (held && task.originalTitle && task.title !== task.originalTitle) {
    // no placeholder for it any more (another project, another kind, now
    // internal): it goes back to the name it was made with
    await prisma.task.update({ where: { id }, data: { title: task.originalTitle } });
  }
}

// The task and the placeholder it fills are one piece of work under one
// name, the placeholder's (Abhishek, 27 Oct 2026); renaming either one
// renames the other (updateTask, updateProjectAsset). The name it was made
// with in production ("Kindness") is kept, once, for the placeholder to show
// our side (never the client's).
async function takeName(id: string, task: { title: string; originalTitle: string | null }, name: string) {
  if (task.title === name) return;
  await prisma.task.update({ where: { id }, data: { title: name, ...(task.originalTitle ? {} : { originalTitle: task.title }) } });
}
