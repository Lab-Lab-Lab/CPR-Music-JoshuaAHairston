import { useRouter } from 'next/router';
import { useEffect } from 'react';
import Spinner from 'react-bootstrap/Spinner';
import { useSelector, useDispatch } from 'react-redux';
import {
  fetchActivities,
  fetchSingleStudentAssignment,
} from '../../../../../actions';
import StudentAssignment from '../../../../../components/student/assignment';
import ConnectActivity from '../../../../../components/student/connect';
import CreativityAuralActivity from '../../../../../components/student/create/aural';
import RespondActivity from '../../../../../components/student/respond';

export default function PerformMelody() {
  const router = useRouter();
  const { slug, piece, actCategory, partType } = router.query;
  const dispatch = useDispatch();

  const userInfo = useSelector((state) => state.currentUser);
  useEffect(() => {
    if (slug && userInfo.token) {
      dispatch(fetchActivities({ slug }));
    }
  }, [slug, userInfo.token]);
  const { items: activities, loaded: loadedActivities } = useSelector(
    (state) => state.activities,
  );

  const assignment = useSelector((state) => state.selectedAssignment);
  useEffect(() => {
    if (loadedActivities) {
      const assignmentId = activities[piece].filter(
        (assn) =>
          assn.piece_slug === piece &&
          (assn.activity_type_category === actCategory ||
            assn.activity_type_category.split(' ')[0] === actCategory),
      )?.[0]?.id;
      dispatch(
        fetchSingleStudentAssignment({
          slug,
          assignmentId,
        }),
      );
    }
  }, [slug, loadedActivities, activities, partType]);

  if (!assignment)
    return (
      <Spinner
        as="span"
        animation="border"
        size="sm"
        role="status"
        aria-hidden="true"
        variant="primary"
      >
        <span className="visually-hidden">Loading...</span>
      </Spinner>
    );

  switch (actCategory) {
    case 'Create':
      return (
        <StudentAssignment assignment={assignment}>
          <CreativityAuralActivity />
        </StudentAssignment>
      );
    case 'Respond':
      return (
        <StudentAssignment assignment={assignment}>
          <RespondActivity />
        </StudentAssignment>
      );
    default:
      return (
        <StudentAssignment assignment={assignment}>
          <ConnectActivity />
        </StudentAssignment>
      );
  }
}
