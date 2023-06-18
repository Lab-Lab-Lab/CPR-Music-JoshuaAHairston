import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'react-query';
import { useDispatch, useSelector } from 'react-redux';
import dynamic from 'next/dynamic';
import Button from 'react-bootstrap/Button';
import { FaCheck, FaFrownOpen } from 'react-icons/fa';
import { getStudentAssignments, mutateCreateSubmission } from '../../../api';
import Spinner from 'react-bootstrap/Spinner';
import Recorder from '../../recorder';
import {
  fetchActivities,
  fetchSingleStudentAssignment,
  postRecording,
} from '../../../actions';
import { UploadStatusEnum } from '../../../types';

const FlatEditor = dynamic(() => import('../../flatEditor'), {
  ssr: false,
});

export default function CreativityAuralActivity() {
  console.log('got into aural component');
//   const dispatch = useDispatch();
//   // I think this should show the melody for the current piece, but in the student's transposition
//   // need to get the student's current assignment
//   const router = useRouter();
//   const { slug, piece } = router.query;
//   const actCategory = 'Create';

//   const userInfo = useSelector((state) => state.currentUser);

//   useEffect(() => {
//     if (slug && userInfo.token) {
//       // console.log('dispatching getStudentAssignments ', slug);
//       dispatch(getStudentAssignments(slug));
//     }
//   }, [slug, userInfo.token]);
//   const {
//     isLoading: loaded,
//     error: assignmentsError,
//     data: assignments,
//   } = useQuery('assignments', getStudentAssignments(slug), {
//     enabled: !!slug,
//   });

//   const assignment = useSelector((state) => state.selectedAssignment);

//   useEffect(() => {
//     if (loaded) {
//       dispatch(
//         fetchSingleStudentAssignment({
//           slug,
//           assignmentId: assignment.id,
//         })
//       );
//     }
//   }, [slug, loaded, assignment]);

//   if (assignments) {
//     console.log('assignments', assignments);
//   }

//   const mutation = useMutation(mutateCreateSubmission({ slug }));

//   let composition = ''; // FIXME: why isn't this useState???
//   // const currentAssignment = assignments && assignments?.filter((assn) => assn.part.piece.slug === piece && assn.activity.activity_type.category === actCategory)?.[0]
//   const currentAssignment =
//     assignments &&
//     Object.values(assignments)
//       .reduce((prev, current) => [...prev, ...current], [])
//       .filter((assn) => {
//         console.log('assn', assn);
//         return (
//           assn.piece_slug === piece &&
//           assn.activity_type_category === actCategory
//         );
//       })?.[0];
//   const currentTransposition = currentAssignment?.instrument.transposition;
//   console.log('currentAssignment', currentAssignment);
//   console.log('currentTransposition', currentTransposition);
//   const flatIOScoreForTransposition = assignment?.part?.transpositions?.filter(
//     (partTransposition) =>
//       partTransposition.transposition.name === currentTransposition
//   )?.[0]?.flatio;

//   const setJsonWrapper = (data) => {
//     mutation.mutate({
//       submission: { content: data },
//       assignmentId: currentAssignment.id,
//     });
//   };
//   const submitCreativity = ({ audio, submissionId }) =>
//     dispatch(
//       postRecording({
//         slug,
//         assignmentId: assignment.id,
//         audio,
//         composition,
//         submissionId,
//       })
//     );
// console.log('flatIOScoreForTransposition', flatIOScoreForTransposition);
//   return (
//     flatIOScoreForTransposition ? (
//       <>
//         <FlatEditor score={JSON.parse(flatIOScoreForTransposition)} />
//         {/* TODO: if the student has already submitted this, do we show their submission here? if so how would they start over? */}
//         <FlatEditor
//           edit
//           score={{
//             scoreId: '62689806be1cd400126c158a',
//             sharingKey:
//               'fc580b58032c2e32d55543ad748043c3fd7f5cd90d764d3cbf01355c5d79a7acdd5c0944cd2127ef6f0b47138a074477c337da654712e73245ed674ffc944ad8',
//           }}
//           onSubmit={setJsonWrapper}
//           submittingStatus={mutation.status}
//           onUpdate={(data) => {
//             // console.log('updated composition', data);
//             composition = data;
//           }}
//         />
//         <Recorder
//           submit={submitCreativity}
//           accompaniment={assignment?.part?.piece?.accompaniment}
//         />
//       </>
//     )
//     : (
//         <Spinner
//           as="span"
//           animation="border"
//           size="sm"
//           role="status"
//           aria-hidden="true"
//         >
//           <span className="visually-hidden">Loading...</span>
//         </Spinner>
//     )
//   );

  return <p>Creativity</p>
}
