import mongoose from 'mongoose';

const REFERENCE_COLLECTIONS = [
  { collection: 'technicalskills', mapKey: 'skill' },
  { collection: 'professionalskills', mapKey: 'skill' },
  { collection: 'softskills', mapKey: 'skill' },
  { collection: 'industries', mapKey: 'industry' },
  { collection: 'activities', mapKey: 'activity' },
  { collection: 'languages', mapKey: 'language' },
];

function isObjectIdLike(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function resolveName(maps, type, value) {
  if (value == null || value === '') return value;
  if (typeof value === 'object' && value.name) return value.name;
  const key = String(value);
  return maps[type]?.get(key) || (isObjectIdLike(key) ? key : value);
}

function populateIdList(maps, type, items) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => resolveName(maps, type, item));
}

function populateSkillEntry(maps, entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const rawSkill = entry.skill;
  const name = resolveName(maps, 'skill', rawSkill);
  return {
    ...entry,
    skill: name,
    ...(isObjectIdLike(String(rawSkill)) ? { skillId: String(rawSkill) } : {}),
  };
}

function populateSkillGroups(maps, skills) {
  if (!skills || typeof skills !== 'object') return skills;
  const populated = { ...skills };

  for (const group of ['technical', 'professional', 'soft', 'contactCenter']) {
    if (!Array.isArray(populated[group])) continue;
    populated[group] = populated[group].map((entry) => {
      if (typeof entry === 'string') return resolveName(maps, 'skill', entry);
      if (entry?.skill !== undefined) return populateSkillEntry(maps, entry);
      return entry;
    });
  }

  return populated;
}

function populateAnalysisRefList(maps, type, items, refField) {
  if (!Array.isArray(items)) return items;
  return items.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const raw = entry[refField];
    return {
      ...entry,
      [refField]: resolveName(maps, type, raw),
      ...(isObjectIdLike(String(raw)) ? { [`${refField}Id`]: String(raw) } : {}),
    };
  });
}

function populateVideoAnalysis(maps, analysis) {
  if (!analysis || typeof analysis !== 'object') return analysis;
  return {
    ...analysis,
    technicalSkills: populateAnalysisRefList(maps, 'skill', analysis.technicalSkills, 'skill'),
    professionalSkills: populateAnalysisRefList(maps, 'skill', analysis.professionalSkills, 'skill'),
    softSkills: populateAnalysisRefList(maps, 'skill', analysis.softSkills, 'skill'),
    spokenLanguages: populateAnalysisRefList(maps, 'language', analysis.spokenLanguages, 'language'),
    industries: populateAnalysisRefList(maps, 'industry', analysis.industries, 'industry'),
    activities: populateAnalysisRefList(maps, 'activity', analysis.activities, 'activity'),
  };
}

function populateExperienceEntry(maps, entry) {
  if (!entry || typeof entry !== 'object') return entry;

  const populated = {
    ...entry,
    industries: populateIdList(maps, 'industry', entry.industries),
    activities: populateIdList(maps, 'activity', entry.activities),
  };

  if (populated.videoAnalysis) {
    populated.videoAnalysis = populateVideoAnalysis(maps, populated.videoAnalysis);
  }

  if (populated.videoLanguageAssessment?.languages) {
    populated.videoLanguageAssessment = {
      ...populated.videoLanguageAssessment,
      languages: populateAnalysisRefList(
        maps,
        'language',
        populated.videoLanguageAssessment.languages,
        'language',
      ),
    };
  }

  return populated;
}

export async function loadReferenceNameMaps(db) {
  const maps = {
    skill: new Map(),
    industry: new Map(),
    activity: new Map(),
    language: new Map(),
  };

  await Promise.all(
    REFERENCE_COLLECTIONS.map(async ({ collection, mapKey }) => {
      const docs = await db
        .collection(collection)
        .find({})
        .project({ name: 1 })
        .toArray()
        .catch(() => []);

      for (const doc of docs) {
        maps[mapKey].set(String(doc._id), doc.name);
      }
    }),
  );

  return maps;
}

export function populateAgentReferences(agent, maps) {
  if (!agent) return agent;

  const populated = { ...agent };

  if (populated.professionalSummary) {
    populated.professionalSummary = {
      ...populated.professionalSummary,
      industries: populateIdList(maps, 'industry', populated.professionalSummary.industries),
      activities: populateIdList(maps, 'activity', populated.professionalSummary.activities),
    };
  }

  populated.skills = populateSkillGroups(maps, populated.skills);

  if (Array.isArray(populated.experience)) {
    populated.experience = populated.experience.map((entry) => populateExperienceEntry(maps, entry));
  }

  return populated;
}

export async function populateAgentForAdmin(db, agent) {
  if (!agent) return null;
  const maps = await loadReferenceNameMaps(db);
  const populated = populateAgentReferences(agent, maps);

  if (populated.plan) {
    const planId = populated.plan;
    let planDoc = null;
    try {
      planDoc = await db
        .collection('plans')
        .findOne({ _id: new mongoose.Types.ObjectId(String(planId)) });
    } catch {
      planDoc = null;
    }
    populated.planName = planDoc?.name || null;
  }

  return populated;
}
