import * as api from '/vendor/firebase/firebase-firestore.js';
import { db } from './firebase.js';
import { readCharacter } from './database-reader.js';
import { createCampaignStore } from './campaign-store.js?v=campaign-flow1';

export const campaigns = createCampaignStore({ db, api, readCharacter });
