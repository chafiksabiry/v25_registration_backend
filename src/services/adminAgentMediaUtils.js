export const VIDEO_SKILL_MARKER = 'Detected from experience video';

export async function checkMediaUrl(url) {
  if (!url) return false;
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

export async function enrichAgentMedia(agent) {
  if (!agent) return agent;

  const experience = await Promise.all(
    (agent.experience || []).map(async (exp) => {
      const hasVideo = Boolean(exp?.videoUrl);
      const videoOk = hasVideo ? await checkMediaUrl(exp.videoUrl) : false;
      const hasAnalysis = Boolean(exp?.videoAnalysis && Object.keys(exp.videoAnalysis).length);

      return {
        ...exp,
        mediaStatus: {
          hasVideo,
          videoOk,
          needsReanalysis: hasAnalysis && !videoOk,
        },
      };
    }),
  );

  const hasValidVideoAnalysis = experience.some(
    (exp) => exp.mediaStatus?.videoOk && exp.videoAnalysis,
  );

  const skills = agent.skills || {};
  const enrichedSkills = {};

  for (const type of ['technical', 'professional', 'soft', 'contactCenter']) {
    enrichedSkills[type] = (skills[type] || []).map((entry) => {
      if (typeof entry === 'string') return entry;
      const fromVideo = entry?.details === VIDEO_SKILL_MARKER;
      return {
        ...entry,
        fromVideoAnalysis: fromVideo,
        needsReanalysis: fromVideo && !hasValidVideoAnalysis,
      };
    });
  }

  return {
    ...agent,
    experience,
    skills: enrichedSkills,
    mediaSummary: {
      hasValidVideoAnalysis,
      experiencesNeedingReanalysis: experience.filter((e) => e.mediaStatus?.needsReanalysis).length,
    },
  };
}
