import { PrivateAccessDeniedError } from "./privateAccessErrors.js";
import { getSession } from "../auth/service.js";
import { database } from "../infra/db.js";
import { getOfficeRole } from "./repository.js";
import { readOfficeDesks } from "./deskRepository.js";
import type { PrivatePerson } from "./privateZoneAccess.js";
export interface PrivateAccessQueries {
  authorize(person: PrivatePerson, officeId: string): Promise<boolean>;
  owner(officeId: string, zoneId: string): Promise<string | null>;
}
export const privateAccessQueries: PrivateAccessQueries = {
  async authorize(person, officeId) { const account = await getSession(person.sessionToken); return account?.username === person.username && !!(await getOfficeRole(account.username, officeId, account.role === "maintainer")); },
  async owner(officeId, zoneId) {
    if (!database)
      throw new Error("Desk access storage is unavailable.");
    const desk = (await readOfficeDesks(database, officeId)).find(entry => entry.zoneId === zoneId);
    if (!desk)
      throw new PrivateAccessDeniedError("This desk is unavailable.");
    return desk.ownerUsername;
  },
};
